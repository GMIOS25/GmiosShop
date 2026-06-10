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

    // 4. Parse request body
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

    const { accountId, buyerEmail } = body
    if (!accountId || !buyerEmail) {
      return new Response(JSON.stringify({ error: "Bad Request: Missing accountId or buyerEmail" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 5. Initialize Service Role Client to bypass RLS and perform transactional-like edits
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    // 6. Fetch Account details & check availability
    const { data: account, error: accountFetchError } = await serviceClient
      .from("accounts")
      .select("id, price, status")
      .eq("id", accountId)
      .single()

    if (accountFetchError || !account) {
      console.error(`Account ${accountId} not found or query error:`, accountFetchError)
      return new Response(JSON.stringify({ error: "Không tìm thấy tài khoản game được yêu cầu" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    if (account.status !== "available") {
      console.warn(`Account ${accountId} is not available. Status: ${account.status}`)
      return new Response(JSON.stringify({ error: "Tài khoản game này đã có người đặt mua hoặc không còn trống" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 7. Update account status to 'pending' to hold/reserve the account (Concurrency Check)
    const { data: updatedAccount, error: accountUpdateError } = await serviceClient
      .from("accounts")
      .update({ status: "pending" })
      .eq("id", accountId)
      .eq("status", "available") // Đảm bảo chỉ update nếu trạng thái vẫn khả dụng
      .select()

    if (accountUpdateError || !updatedAccount || updatedAccount.length === 0) {
      console.warn(`Account status was changed before reservation: ${accountId}`, accountUpdateError)
      return new Response(JSON.stringify({ error: "Có người khác đang đặt mua tài khoản này. Vui lòng thử lại sau" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 8. Generate Unique Payment Code
    const randomDigit = Math.floor(Math.random() * 10)
    const paymentCode = `GMS${Date.now()}${randomDigit}`

    // 9. Create New Order
    const { data: order, error: orderCreateError } = await serviceClient
      .from("orders")
      .insert({
        user_id: user.id,
        account_id: accountId,
        amount: account.price,
        payment_code: paymentCode,
        buyer_email: buyerEmail,
        payment_status: "pending"
      })
      .select(`
        *,
        account:accounts(
          id,
          title,
          price,
          game:games(name, slug)
        )
      `)
      .single()

    if (orderCreateError) {
      console.error("Failed to create order. Rolling back account status to 'available'. Error:", orderCreateError)
      
      // Rollback: Trả trạng thái account về available
      await serviceClient
        .from("accounts")
        .update({ status: "available" })
        .eq("id", accountId)

      return new Response(JSON.stringify({ error: "Không thể khởi tạo đơn hàng. Hệ thống đã tự động hoàn tác" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    console.log(`Successfully reserved Account ${accountId} and created Order ${order.id} (Payment Code: ${paymentCode})`)

    return new Response(JSON.stringify(order), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    })

  } catch (error) {
    console.error("Unhandled exception in create-order edge function:", error)
    return new Response(JSON.stringify({ error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    })
  }
})
