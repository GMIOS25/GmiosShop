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
    // 1. Verify HTTP Method (Chỉ cho phép POST để truyền auth token an toàn)
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

    // 5. Query Statistics (Sử dụng head: true và count: exact để tránh truyền tải dữ liệu thừa)
    const [
      gamesCountRes,
      accountsCountRes,
      availableAccountsRes,
      soldAccountsRes,
      pendingAccountsRes,
      ordersCountRes,
      paidOrdersRes,
      pendingOrdersRes,
      expiredOrdersRes,
      revenueRes
    ] = await Promise.all([
      adminClient.from("games").select("*", { count: "exact", head: true }),
      adminClient.from("accounts").select("*", { count: "exact", head: true }),
      adminClient.from("accounts").select("*", { count: "exact", head: true }).eq("status", "available"),
      adminClient.from("accounts").select("*", { count: "exact", head: true }).eq("status", "sold"),
      adminClient.from("accounts").select("*", { count: "exact", head: true }).eq("status", "pending"),
      adminClient.from("orders").select("*", { count: "exact", head: true }),
      adminClient.from("orders").select("*", { count: "exact", head: true }).eq("payment_status", "paid"),
      adminClient.from("orders").select("*", { count: "exact", head: true }).eq("payment_status", "pending"),
      adminClient.from("orders").select("*", { count: "exact", head: true }).eq("payment_status", "expired"),
      adminClient.from("orders").select("amount").eq("payment_status", "paid")
    ])

    // Kiểm tra lỗi các truy vấn bắt buộc
    if (gamesCountRes.error) throw gamesCountRes.error
    if (accountsCountRes.error) throw accountsCountRes.error
    if (ordersCountRes.error) throw ordersCountRes.error
    if (revenueRes.error) throw revenueRes.error

    // Tính tổng doanh thu từ các hóa đơn đã thanh toán
    const totalRevenue = (revenueRes.data || []).reduce((sum: number, o: any) => sum + Number(o.amount), 0)

    const stats = {
      totalGames: gamesCountRes.count || 0,
      totalAccounts: accountsCountRes.count || 0,
      availableAccounts: availableAccountsRes.count || 0,
      soldAccounts: soldAccountsRes.count || 0,
      pendingAccounts: pendingAccountsRes.count || 0,
      totalOrders: ordersCountRes.count || 0,
      paidOrders: paidOrdersRes.count || 0,
      pendingOrders: pendingOrdersRes.count || 0,
      expiredOrders: expiredOrdersRes.count || 0,
      totalRevenue
    }

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    })

  } catch (error) {
    console.error("Unhandled exception in get-dashboard-stats edge function:", error)
    return new Response(JSON.stringify({ error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    })
  }
})
