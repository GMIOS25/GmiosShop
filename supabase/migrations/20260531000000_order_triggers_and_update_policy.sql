-- Migration: 20260531000000_order_triggers_and_update_policy.sql
-- Goal:
-- 1. Allow authenticated users to securely expire/cancel their own orders.
-- 2. Automatically synchronize accounts.status based on orders insertion and updates.

-- 1. Allow users to update their own orders to 'expired' from 'pending'
CREATE POLICY "Allow users to update their own orders to expired" ON orders FOR
UPDATE TO authenticated USING (
    auth.uid () = user_id
    AND payment_status = 'pending'
)
WITH
    CHECK (
        auth.uid () = user_id
        AND payment_status = 'expired'
    );

-- 2. Create the trigger function to synchronize accounts.status with orders.payment_status
CREATE OR REPLACE FUNCTION sync_account_status_on_order_change()
RETURNS TRIGGER AS $$
BEGIN
    -- On INSERT of a new pending order
    IF TG_OP = 'INSERT' THEN
        IF NEW.payment_status = 'pending' THEN
            UPDATE accounts
            SET status = 'pending'
            WHERE id = NEW.account_id;
        END IF;
    
    -- On UPDATE of an existing order's payment_status
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
            IF NEW.payment_status = 'paid' THEN
                -- Temporarily revert account status to 'available' so that the sepay-webhook
                -- update query (.eq("status", "available")) can successfully match and set it to 'sold'
                UPDATE accounts
                SET status = 'available'
                WHERE id = NEW.account_id;
            ELSIF NEW.payment_status = 'expired' THEN
                UPDATE accounts
                SET status = 'available'
                WHERE id = NEW.account_id;
            ELSIF NEW.payment_status = 'pending' THEN
                UPDATE accounts
                SET status = 'pending'
                WHERE id = NEW.account_id;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Bind trigger for inserts on orders
CREATE TRIGGER order_insert_sync_account
    AFTER INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION sync_account_status_on_order_change();

-- 4. Bind trigger for updates on orders
CREATE TRIGGER order_update_sync_account
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION sync_account_status_on_order_change();

-- 5. Enable Supabase Realtime for orders and accounts tables
-- This ensures that the frontend subscribeToOrderRealtime gets instant broadcast notifications on status changes!
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

ALTER PUBLICATION supabase_realtime ADD TABLE accounts;