import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Hàm băm SHA-1 để tạo chữ ký (signature) giống như khi upload
async function sha1(string: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(string)
  const hashBuffer = await crypto.subtle.digest("SHA-1", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 1. Lấy thông tin cấu hình Cloudinary từ biến môi trường
    const cloudinaryCloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME")
    const cloudinaryApiKey = Deno.env.get("CLOUDINARY_API_KEY")
    const cloudinaryApiSecret = Deno.env.get("CLOUDINARY_API_SECRET")

    if (!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
      return new Response(JSON.stringify({ error: "Server Configuration Error: Cloudinary settings are missing" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 2. Lấy thông tin cấu hình Supabase từ biến môi trường
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Server Configuration Error: Supabase settings are missing" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 3. Xác thực Token người dùng (JWT verification)
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization")
    if (!authHeader) {
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
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired token" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 4. Kiểm tra quyền Admin
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    const { data: roleData, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (roleError || !roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: Admin privileges required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 5. Lấy public_id từ body của Request
    const { public_id } = await req.json()
    if (!public_id) {
      return new Response(JSON.stringify({ error: "Bad Request: Missing public_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 3. Tạo chữ ký (Signature) bảo mật cho hành động xóa (destroy)
    // Quy tắc xếp block để hash: Các tham số xếp theo thứ tự alphabet (public_id rồi đến timestamp)
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const stringToSign = `public_id=${public_id}&timestamp=${timestamp}${cloudinaryApiSecret}`
    const signature = await sha1(stringToSign)

    // 4. Chuẩn bị dữ liệu gửi tới Cloudinary API bằng FormData
    const cloudinaryForm = new FormData()
    cloudinaryForm.append("public_id", public_id)
    cloudinaryForm.append("api_key", cloudinaryApiKey)
    cloudinaryForm.append("timestamp", timestamp)
    cloudinaryForm.append("signature", signature)

    // URL endpoint dành cho việc xóa ảnh
    const cloudinaryDestroyUrl = `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/destroy`

    console.log(`Đang gửi yêu cầu xóa ảnh có public_id: ${public_id}`)

    const cloudinaryResponse = await fetch(cloudinaryDestroyUrl, {
      method: "POST",
      body: cloudinaryForm,
    })

    if (!cloudinaryResponse.ok) {
      const errorText = await cloudinaryResponse.text()
      return new Response(JSON.stringify({ error: "Cloudinary error", details: errorText }), { status: 502, headers: corsHeaders })
    }

    const result = await cloudinaryResponse.json()

    // Nếu xóa thành công, Cloudinary trả về { "result": "ok" }
    // Nếu không tìm thấy ảnh, trả về { "result": "not_found" }
    if (result.result !== "ok") {
      return new Response(JSON.stringify({ error: "Xóa thất bại", cloudinary_result: result.result }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ message: "Xóa ảnh thành công!", status: result.result }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    })

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: "Internal Server Error", details: errorMsg }), { status: 500, headers: corsHeaders })
  }
})