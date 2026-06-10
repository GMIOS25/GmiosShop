import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    // 2. Load environment variables
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

    // 3. Authenticate User Token (JWT verification)
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

    // 4. Authorize User (Kiểm tra quyền admin)
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

    // 5. Parse request body
    let body
    try {
      body = await req.json()
    } catch (err) {
      console.error("Failed to parse request JSON body:", err)
      return new Response(JSON.stringify({ error: "Bad Request: Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    const { accountData, credentialsData } = body
    if (!accountData || !credentialsData || !accountData.game_id || !accountData.title || accountData.price === undefined || !credentialsData.username || !credentialsData.password) {
      return new Response(JSON.stringify({ error: "Bad Request: Missing required fields in accountData or credentialsData" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 6. Create Account (Sử dụng Service Client để bỏ qua RLS và ghi dữ liệu an toàn)
    const { data: account, error: accountError } = await adminClient
      .from("accounts")
      .insert({
        game_id: accountData.game_id,
        title: accountData.title,
        description: accountData.description,
        price: accountData.price,
        status: "available",
        images: accountData.images || []
      })
      .select()
      .single()

    if (accountError || !account) {
      console.error("Failed to insert account in admin-create-account Edge Function:", accountError)
      return new Response(JSON.stringify({ error: "Không thể tạo tài khoản game trong cơ sở dữ liệu", details: accountError?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 7. Create Credentials using the created account ID
    const { error: credsError } = await adminClient
      .from("account_credentials")
      .insert({
        account_id: account.id,
        username: credentialsData.username,
        password: credentialsData.password
      })

    if (credsError) {
      console.error(`Failed to insert credentials for account ${account.id}. Rolling back account creation. Error:`, credsError)
      
      // Rollback: Xóa account vừa tạo
      await adminClient
        .from("accounts")
        .delete()
        .eq("id", account.id)

      return new Response(JSON.stringify({ error: "Không thể tạo thông tin đăng nhập. Tiến trình tạo tài khoản đã tự động hoàn tác" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    console.log(`Successfully created account ${account.id} with credentials in atomic server transaction.`)

    return new Response(JSON.stringify(account), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    })

  } catch (error) {
    console.error("Unhandled exception in admin-create-account edge function:", error)
    return new Response(JSON.stringify({ error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    })
  }
})
