-- Migration file: 20260524000000_rls_and_credentials.sql
-- Goal: Separate sensitive credentials from accounts table and configure RLS policies.

-- 1. Create account_credentials table to hold sensitive game credentials
CREATE TABLE account_credentials (
    account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Migrate existing username and password from accounts to account_credentials
INSERT INTO account_credentials (account_id, username, password)
SELECT id, username, password FROM accounts;

-- 3. Drop username and password columns from accounts table to protect them from direct select
ALTER TABLE accounts DROP COLUMN username;
ALTER TABLE accounts DROP COLUMN password;

-- 4. Enable Row Level Security (RLS) on all tables
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 5. Set RLS Policies for games table
-- Allow public (anonymous and authenticated) to read games list
CREATE POLICY "Allow public read access to games" ON games
    FOR SELECT TO public USING (true);

-- 6. Set RLS Policies for accounts table
-- Allow public to view available or pending accounts
CREATE POLICY "Allow public read access to available accounts" ON accounts
    FOR SELECT TO public USING (status = 'available' OR status = 'pending');

-- Allow authenticated purchasers to read metadata of their purchased sold accounts
CREATE POLICY "Allow purchasers to read their sold accounts" ON accounts
    FOR SELECT TO authenticated USING (
        status = 'sold' AND EXISTS (
            SELECT 1 FROM orders
            WHERE orders.account_id = accounts.id
              AND orders.user_id = auth.uid()
              AND orders.payment_status = 'paid'
        )
    );

-- 7. Set RLS Policies for account_credentials table
-- Allow only authenticated purchasers to read credentials for their paid accounts
CREATE POLICY "Allow purchasers to read account credentials" ON account_credentials
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM orders
            WHERE orders.account_id = account_credentials.account_id
              AND orders.user_id = auth.uid()
              AND orders.payment_status = 'paid'
        )
    );

-- 8. Set RLS Policies for orders table
-- Allow authenticated users to view only their own orders
CREATE POLICY "Allow users to read their own orders" ON orders
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Allow authenticated users to create orders for themselves
CREATE POLICY "Allow users to create their own orders" ON orders
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
