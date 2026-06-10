import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1"

// CORS headers configuration
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Helper function to calculate SHA-1 hex hash using Deno's Web Crypto API
async function sha1(string: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(string)
  const hashBuffer = await crypto.subtle.digest("SHA-1", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
}

serve(async (req: Request) => {
  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // 1. Verify HTTP Method
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 2. Load and verify Cloudinary environment variables
    const cloudinaryCloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME")
    const cloudinaryApiKey = Deno.env.get("CLOUDINARY_API_KEY")
    const cloudinaryApiSecret = Deno.env.get("CLOUDINARY_API_SECRET")

    if (!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
      console.error("Missing Cloudinary environment secrets on server.")
      return new Response(JSON.stringify({ error: "Server Configuration Error: Cloudinary settings are missing" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 3. Load Supabase environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error("Missing Supabase environment secrets on server.")
      return new Response(JSON.stringify({ error: "Server Configuration Error: Supabase settings are missing" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 4. Authenticate User Token (JWT verification)
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization")
    if (!authHeader) {
      console.warn("Authentication failed: Missing Authorization header.")
      return new Response(JSON.stringify({ error: "Unauthorized: Missing Authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim()
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      console.warn("Authentication failed: Invalid or expired token.", userError)
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired token" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 5. Authorize User (Check if role is 'admin' via user_roles table using Service Role Client)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    const { data: roleData, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (roleError || !roleData || roleData.role !== "admin") {
      console.warn(`Authorization failed: User ${user.id} does not have admin role.`)
      return new Response(JSON.stringify({ error: "Forbidden: Admin privileges required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 6. Parse Form Data and retrieve file
    // 6. Parse Form Data and retrieve ALL files
    let formData: FormData
    try {
      formData = await req.formData()
    } catch (err) {
      console.error("Failed to parse request form data:", err)
      return new Response(JSON.stringify({ error: "Bad Request: Invalid multipart form data" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // Thay .get() bằng .getAll() để lấy danh sách tất cả các file
    const files = formData.getAll("file") as File[]
    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ error: "Bad Request: Missing 'file' keys in form data" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    const secureUrls: string[] = []
    const folder = "gmios-shop"
    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/upload`

    // Duyệt qua từng file và upload song song bằng Promise.all
    try {
      await Promise.all(
        files.map(async (file) => {
          const timestamp = Math.floor(Date.now() / 1000).toString()
          const stringToSign = `folder=${folder}&timestamp=${timestamp}${cloudinaryApiSecret}`
          const signature = await sha1(stringToSign)

          const cloudinaryForm = new FormData()
          cloudinaryForm.append("file", file)
          cloudinaryForm.append("api_key", cloudinaryApiKey)
          cloudinaryForm.append("timestamp", timestamp)
          cloudinaryForm.append("folder", folder)
          cloudinaryForm.append("signature", signature)

          console.log(`Uploading file: ${file.name} to Cloudinary...`)

          const cloudinaryResponse = await fetch(cloudinaryUrl, {
            method: "POST",
            body: cloudinaryForm,
          })

          if (!cloudinaryResponse.ok) {
            const errorText = await cloudinaryResponse.text()
            throw new Error(`Cloudinary error for ${file.name}: ${errorText}`)
          }

          const cloudinaryData = await cloudinaryResponse.json()
          secureUrls.push(cloudinaryData.secure_url)
        })
      )
    } catch (uploadError) {
      console.error("One or more files failed to upload:", uploadError)
      return new Response(JSON.stringify({ error: "Gateway Error: Cloudinary upload failed", details: uploadError.message }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    console.log(`All uploads successful! Urls:`, secureUrls)

    // Trả về mảng chứa tất cả các đường dẫn ảnh đã upload thành công
    return new Response(JSON.stringify({ secure_urls: secureUrls }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    })
  } catch (error) {
    console.error("Unhandled exception in cloudinary-upload edge function:", error)
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    })
  }
})
