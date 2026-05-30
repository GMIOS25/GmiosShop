import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req: Request) => {
  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // 1. Verify Authorization Header (SePay API Key)
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization")
    const expectedApiKey = Deno.env.get("SEPAY_API_KEY")

    if (!expectedApiKey) {
      console.error("SEPAY_API_KEY environment variable is not configured in Supabase Edge Secrets.")
      return new Response(JSON.stringify({ error: "Server Configuration Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    if (!authHeader) {
      console.warn("Unauthorized request: Missing Authorization header.")
      return new Response(JSON.stringify({ error: "Unauthorized: Missing Authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // Clean check case-insensitive for 'Apikey ' prefix
    const token = authHeader.replace(/^Apikey\s+/i, "").trim()
    if (token !== expectedApiKey.trim()) {
      console.warn("Unauthorized request: Invalid API Key token.")
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid API Key token" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 2. Parse Webhook Request Body
    let body
    try {
      body = await req.json()
    } catch (e) {
      console.error("Failed to parse JSON body:", e)
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    const { id, transferType, transferAmount, content, description } = body
    console.log(`Received SePay Webhook - Transaction ID: ${id}, Type: ${transferType}, Amount: ${transferAmount}, Content: "${content}"`)

    // 3. Filter out non-inbound transactions (only process money received)
    if (transferType !== "in") {
      console.log(`Transaction ${id} ignored: Transfer type is "${transferType}" instead of "in"`)
      return new Response(JSON.stringify({ success: true, message: "Ignored: Not an inbound transaction" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 4. Initialize Supabase Client with Service Role Key (to bypass RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables are missing.")
      return new Response(JSON.stringify({ error: "Server Configuration Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 5. Fetch all pending orders to match payment code
    const { data: pendingOrders, error: orderFetchError } = await supabase
      .from("orders")
      .select("id, payment_code, amount, account_id, buyer_email")
      .eq("payment_status", "pending")

    if (orderFetchError || !pendingOrders) {
      console.error("Error fetching pending orders from database:", orderFetchError)
      return new Response(JSON.stringify({ error: "Database query failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // Search case-insensitive
    const searchString = `${content || ""} ${description || ""}`.toUpperCase()
    
    // Find matched order where payment_code is contained inside the transfer content or description
    const matchedOrder = pendingOrders.find((order: any) => {
      if (!order.payment_code) return false
      const code = order.payment_code.toUpperCase()
      return searchString.includes(code)
    })

    if (!matchedOrder) {
      console.warn(`No pending order matched transaction content: "${searchString}"`)
      return new Response(JSON.stringify({ success: false, message: "No matching pending order found" }), {
        status: 200, // Returning 200 to prevent SePay from retrying unrecognized transactions repeatedly
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    console.log(`Matched transaction to Order ID: ${matchedOrder.id}, Payment Code: ${matchedOrder.payment_code}`)

    // 6. Validate Payment Amount
    const orderAmount = Number(matchedOrder.amount)
    const receivedAmount = Number(transferAmount)

    if (receivedAmount < orderAmount) {
      console.warn(`Amount Mismatch - Order ID: ${matchedOrder.id}. Expected: ${orderAmount}, Received: ${receivedAmount}`)
      return new Response(JSON.stringify({ 
        success: false, 
        message: `Amount mismatch. Expected ${orderAmount}, received ${receivedAmount}. Order left as pending.` 
      }), {
        status: 200, // Return 200 to prevent retries since it's a client error (short payment)
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 7. Atomic-Like Database Updates (Software-level rollback)
    // Update order status to paid (matching pending status to prevent race conditions/double updates)
    const { data: updatedOrders, error: orderUpdateError } = await supabase
      .from("orders")
      .update({ payment_status: "paid" })
      .eq("id", matchedOrder.id)
      .eq("payment_status", "pending")
      .select()

    if (orderUpdateError || !updatedOrders || updatedOrders.length === 0) {
      console.warn(`Order ${matchedOrder.id} was already updated or could not be updated. Assuming processed.`)
      return new Response(JSON.stringify({ success: true, message: "Order already processed" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // Update account status to sold (matching available status to ensure integrity)
    const { data: updatedAccounts, error: accountUpdateError } = await supabase
      .from("accounts")
      .update({ status: "sold" })
      .eq("id", matchedOrder.account_id)
      .eq("status", "available")
      .select()

    if (accountUpdateError || !updatedAccounts || updatedAccounts.length === 0) {
      console.error(`Failed to update account ${matchedOrder.account_id} to sold. Rolling back order update.`)
      // Rollback order status to pending
      await supabase
        .from("orders")
        .update({ payment_status: "pending" })
        .eq("id", matchedOrder.id)

      return new Response(JSON.stringify({ error: "Failed to update account status. Order rolled back." }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    console.log(`Successfully updated database: Order ${matchedOrder.payment_code} set to "paid", Account ${matchedOrder.account_id} set to "sold"`)

    // 8. Fetch sensitive game credentials to send to user
    const { data: credentials, error: credsError } = await supabase
      .from("account_credentials")
      .select("username, password")
      .eq("account_id", matchedOrder.account_id)
      .single()

    if (credsError || !credentials) {
      console.error(`Failed to fetch credentials for account ${matchedOrder.account_id}:`, credsError)
      // Note: We don't rollback the transaction since money was already processed, just log the failure.
    }

    // 9. Send confirmation email with credentials via Resend API
    const resendApiKey = Deno.env.get("RESEND_API_KEY")
    if (resendApiKey) {
      try {
        const emailHtml = `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
            <div style="text-align: center; margin-bottom: 25px; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px;">
              <h1 style="color: #0f172a; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.025em;">GmiosShop</h1>
              <p style="color: #64748b; margin: 5px 0 0 0; font-size: 14px;">Giao dịch thanh toán thành công</p>
            </div>
            
            <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">Xin chào,</p>
            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 20px;">Chúng tôi đã nhận được thanh toán đầy đủ cho đơn hàng của bạn. Dưới đây là thông tin chi tiết đơn hàng và tài khoản game đã mua:</p>
            
            <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #10b981;">
              <h2 style="color: #0f172a; font-size: 15px; margin-top: 0; margin-bottom: 12px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Thông tin giao dịch</h2>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="color: #64748b; padding: 6px 0; border-bottom: 1px solid #f1f5f9;">Mã đơn hàng:</td>
                  <td style="color: #0f172a; font-weight: 700; text-align: right; padding: 6px 0; border-bottom: 1px solid #f1f5f9;">${matchedOrder.payment_code}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; padding: 6px 0;">Số tiền nhận được:</td>
                  <td style="color: #10b981; font-weight: 700; text-align: right; padding: 6px 0; font-size: 16px;">${Number(transferAmount).toLocaleString('vi-VN')} đ</td>
                </tr>
              </table>
            </div>
            
            <div style="background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 25px; border: 1px dashed #cbd5e1; text-align: center;">
              <h2 style="color: #0f172a; font-size: 16px; margin-top: 0; margin-bottom: 15px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Thông tin tài khoản Game</h2>
              <div style="display: inline-block; text-align: left; background: #ffffff; padding: 15px 25px; border-radius: 6px; border: 1px solid #e2e8f0; min-width: 250px;">
                <div style="margin-bottom: 10px;">
                  <span style="color: #64748b; font-size: 13px; display: block; margin-bottom: 2px;">Tài khoản (Username):</span>
                  <strong style="color: #0f172a; font-size: 16px; font-family: 'Courier New', Courier, monospace; letter-spacing: 0.05em;">${credentials?.username || "Liên hệ hỗ trợ"}</strong>
                </div>
                <div>
                  <span style="color: #64748b; font-size: 13px; display: block; margin-bottom: 2px;">Mật khẩu (Password):</span>
                  <strong style="color: #ef4444; font-size: 16px; font-family: 'Courier New', Courier, monospace; letter-spacing: 0.05em;">${credentials?.password || "Liên hệ hỗ trợ"}</strong>
                </div>
              </div>
              <p style="color: #b91c1c; font-size: 12px; margin-top: 15px; margin-bottom: 0; font-weight: 600;">⚠️ Lưu ý quan trọng: Vui lòng đăng nhập và tiến hành thay đổi mật khẩu ngay lập tức để bảo mật tài khoản tuyệt đối.</p>
            </div>
            
            <div style="color: #64748b; font-size: 13px; line-height: 1.6; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center;">
              <p style="margin: 0 0 8px 0;">Nếu gặp bất kỳ khó khăn hoặc sự cố nào khi nhận tài khoản, xin vui lòng phản hồi email này hoặc liên hệ hỗ trợ trực tuyến trên website của chúng tôi.</p>
              <p style="margin: 0; font-weight: 600; color: #475569;">© 2026 GmiosShop. All rights reserved.</p>
            </div>
          </div>
        `

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: "GmiosShop <onboarding@resend.dev>",
            to: [matchedOrder.buyer_email],
            subject: `[GmiosShop] Thông tin tài khoản đơn hàng ${matchedOrder.payment_code}`,
            html: emailHtml,
          }),
        })

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text()
          console.error("Resend API response error:", errorText)
        } else {
          console.log(`Successfully sent account credentials email to ${matchedOrder.buyer_email}`)
        }
      } catch (emailErr) {
        console.error("Unexpected error while sending email via Resend:", emailErr)
      }
    } else {
      console.warn("RESEND_API_KEY environment variable is not configured. Email skipped.")
    }

    return new Response(JSON.stringify({ success: true, message: "Transaction processed successfully" }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    })

  } catch (error) {
    console.error("Unhandled error in Webhook Handler:", error)
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    })
  }
})
