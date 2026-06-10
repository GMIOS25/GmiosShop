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

    // 8. Trigger credentials email sending via internal Edge Function call
    const sendEmailUrl = `${supabaseUrl}/functions/v1/send-order-email`
    try {
      console.log(`Triggering send-order-email for Order ID: ${matchedOrder.id}...`)
      const emailResponse = await fetch(sendEmailUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ orderId: matchedOrder.id }),
      })

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text()
        console.error(`Failed to trigger send-order-email: Status ${emailResponse.status} - ${errorText}`)
      } else {
        console.log(`Successfully triggered send-order-email for Order ID: ${matchedOrder.id}`)
      }
    } catch (triggerErr) {
      console.error("Unexpected error triggering send-order-email:", triggerErr)
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
