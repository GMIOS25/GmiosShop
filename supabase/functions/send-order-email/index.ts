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
    // 1. Verify Authorization Header (Supabase Service Role Key)
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseServiceKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY environment variable is not configured in Supabase Edge Secrets.")
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

    const token = authHeader.replace(/^Bearer\s+/i, "").trim()
    if (token !== supabaseServiceKey.trim()) {
      console.warn("Unauthorized request: Invalid Service Role token.")
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid Service Role token" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 2. Parse request body
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

    const { orderId } = body
    if (!orderId) {
      return new Response(JSON.stringify({ error: "Missing orderId parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 3. Initialize Supabase Client with Service Role Key (to bypass RLS and fetch credentials)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    if (!supabaseUrl) {
      console.error("SUPABASE_URL environment variable is missing.")
      return new Response(JSON.stringify({ error: "Server Configuration Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 4. Fetch Order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, payment_code, amount, account_id, buyer_email, payment_status")
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      console.error(`Failed to fetch order ${orderId} from database:`, orderError)
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 5. Guard check: Only send email for paid orders
    if (order.payment_status !== "paid") {
      console.warn(`Attempted to send credentials for order ${orderId} with status "${order.payment_status}"`)
      return new Response(JSON.stringify({ error: "Order is not paid" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 6. Fetch sensitive game credentials
    const { data: credentials, error: credsError } = await supabase
      .from("account_credentials")
      .select("username, password")
      .eq("account_id", order.account_id)
      .single()

    if (credsError || !credentials) {
      console.error(`Failed to fetch credentials for account ${order.account_id}:`, credsError)
      return new Response(JSON.stringify({ error: "Failed to retrieve account credentials" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    // 7. Send confirmation email with credentials via Resend API
    const resendApiKey = Deno.env.get("RESEND_API_KEY")
    if (!resendApiKey) {
      console.warn("RESEND_API_KEY environment variable is not configured. Email skipped.")
      return new Response(JSON.stringify({ success: true, message: "RESEND_API_KEY not configured, skipped sending email" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

    try {
      const emailHtml = `
        <div style="background-color: #0b0f19; padding: 40px 10px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          <div style="max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #1e293b; border-radius: 16px; background-color: #111827; color: #f3f4f6; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);">
            
            <div style="text-align: center; margin-bottom: 25px; border-bottom: 1px solid #1e293b; padding-bottom: 20px;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.025em; text-transform: uppercase;">GmiosShop</h1>
              <p style="color: #9ca3af; margin: 5px 0 0 0; font-size: 14px;">Giao dịch thanh toán thành công</p>
            </div>
            
            <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px; color: #e5e7eb;">Xin chào,</p>
            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 25px; color: #9ca3af;">Chúng tôi đã nhận được thanh toán đầy đủ cho đơn hàng của bạn. Dưới đây là thông tin chi tiết đơn hàng và tài khoản game đã mua:</p>
            
            <div style="background-color: #1f2937; border-radius: 10px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #10b981;">
              <h2 style="color: #ffffff; font-size: 15px; margin-top: 0; margin-bottom: 12px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Thông tin giao dịch</h2>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="color: #9ca3af; padding: 8px 0; border-bottom: 1px solid #374151;">Mã đơn hàng:</td>
                  <td style="color: #ffffff; font-weight: 700; text-align: right; padding: 8px 0; border-bottom: 1px solid #374151;">${order.payment_code}</td>
                </tr>
                <tr>
                  <td style="color: #9ca3af; padding: 8px 0;">Số tiền nhận được:</td>
                  <td style="color: #10b981; font-weight: 700; text-align: right; padding: 8px 0; font-size: 16px;">${Number(order.amount).toLocaleString('vi-VN')} đ</td>
                </tr>
              </table>
            </div>
            
            <div style="background-color: #1f2937; border-radius: 10px; padding: 20px; margin-bottom: 25px; border: 1px dashed #4b5563; text-align: center;">
              <h2 style="color: #ffffff; font-size: 16px; margin-top: 0; margin-bottom: 15px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Thông tin tài khoản Game</h2>
              <div style="display: inline-block; text-align: left; background: #111827; padding: 15px 25px; border-radius: 8px; border: 1px solid #374151; min-width: 260px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.6);">
                <div style="margin-bottom: 12px;">
                  <span style="color: #9ca3af; font-size: 13px; display: block; margin-bottom: 4px;">Tài khoản (Username):</span>
                  <strong style="color: #38bdf8; font-size: 17px; font-family: 'Courier New', Courier, monospace; letter-spacing: 0.05em;">${credentials.username}</strong>
                </div>
                <div>
                  <span style="color: #9ca3af; font-size: 13px; display: block; margin-bottom: 4px;">Mật khẩu (Password):</span>
                  <strong style="color: #f43f5e; font-size: 17px; font-family: 'Courier New', Courier, monospace; letter-spacing: 0.05em;">${credentials.password}</strong>
                </div>
              </div>
              <p style="color: #fca5a5; font-size: 12px; margin-top: 15px; margin-bottom: 0; font-weight: 600;">⚠️ Lưu ý quan trọng: Vui lòng đăng nhập và tiến hành thay đổi mật khẩu ngay lập tức để bảo mật tài khoản tuyệt đối.</p>
            </div>
            
            <!-- White CTA Button -->
            <div style="text-align: center; margin: 30px 0 25px 0;">
              <a href="${Deno.env.get("SITE_URL") || 'https://gmios.shop'}" target="_blank" style="display: inline-block; padding: 14px 30px; background-color: #ffffff; color: #111827; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; text-transform: uppercase; letter-spacing: 0.025em; box-shadow: 0 4px 12px rgba(255, 255, 255, 0.15);">
                Đăng nhập GmiosShop
              </a>
            </div>
            
            <div style="color: #6b7280; font-size: 13px; line-height: 1.6; border-top: 1px solid #1e293b; padding-top: 20px; text-align: center;">
              <p style="margin: 0 0 8px 0; color: #9ca3af;">Nếu gặp bất kỳ khó khăn hoặc sự cố nào khi nhận tài khoản, xin vui lòng phản hồi email này hoặc liên hệ hỗ trợ trực tuyến trên website của chúng tôi.</p>
              <p style="margin: 0; font-weight: 600; color: #4b5563;">© 2026 GmiosShop. All rights reserved.</p>
            </div>
            
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
          to: [order.buyer_email],
          subject: `[GmiosShop] Thông tin tài khoản đơn hàng ${order.payment_code}`,
          html: emailHtml,
        }),
      })

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text()
        console.error("Resend API response error:", errorText)
        return new Response(JSON.stringify({ error: "Failed to send email via Resend API" }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        })
      }

      console.log(`Successfully sent account credentials email to ${order.buyer_email}`)
      return new Response(JSON.stringify({ success: true, message: "Credentials email sent successfully" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    } catch (emailErr) {
      console.error("Unexpected error while sending email via Resend:", emailErr)
      return new Response(JSON.stringify({ error: "Internal error during email dispatch" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      })
    }

  } catch (error) {
    console.error("Unhandled error in send-order-email Handler:", error)
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    })
  }
})
