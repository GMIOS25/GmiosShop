-- Verification Script: verify_rls.sql
-- Run this in your Supabase SQL editor or psql to test RLS policies safely.
-- All operations are wrapped in a transaction and rolled back at the end.

BEGIN;

-- Create a temporary table to collect test logs so they display in Supabase SQL Editor
CREATE TEMP TABLE IF NOT EXISTS test_logs (
    id SERIAL PRIMARY KEY,
    test_case TEXT,
    status TEXT,
    details TEXT
);

-- Grant permissions to anon and authenticated roles so they can write logs during role-switching
GRANT ALL ON test_logs TO anon, authenticated;
GRANT ALL ON SEQUENCE test_logs_id_seq TO anon, authenticated;


-- 0. Seed test users (Since we reference auth.users, we must temporarily mock a user in auth.users)
-- Supabase creates the auth schema and auth.users table automatically, so we don't recreate them here.
-- Clean up any existing test records to avoid conflicts
DELETE FROM auth.users
WHERE
    id IN (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002'
    );

INSERT INTO
    auth.users (id, email)
VALUES (
        '00000000-0000-0000-0000-000000000001',
        'buyer@gmios.com'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'hacker@gmios.com'
    );

-- 1. Seed test games
DO $$
DECLARE
    v_game_id UUID;
    v_acc_avail_id UUID;
    v_acc_sold_id UUID;
BEGIN
    INSERT INTO games (name, slug) 
    VALUES ('Test Game RLS', 'test-rls') 
    RETURNING id INTO v_game_id;

    -- 2. Seed test accounts
    INSERT INTO accounts (game_id, title, price, status) 
    VALUES (v_game_id, 'Available Account', 100000, 'available')
    RETURNING id INTO v_acc_avail_id;

    INSERT INTO accounts (game_id, title, price, status) 
    VALUES (v_game_id, 'Sold Account', 200000, 'sold')
    RETURNING id INTO v_acc_sold_id;

    -- 3. Seed account credentials
    INSERT INTO account_credentials (account_id, username, password) 
    VALUES 
    (v_acc_avail_id, 'avail_user', 'avail_pass123'),
    (v_acc_sold_id, 'sold_user', 'sold_pass123');

    -- 4. Seed order for the sold account (buyer bought it and paid)
    INSERT INTO orders (user_id, account_id, amount, payment_status, payment_code, buyer_email)
    VALUES ('00000000-0000-0000-0000-000000000001', v_acc_sold_id, 200000, 'paid', 'GMISTESTPAID', 'buyer@gmios.com');

    -- =========================================================================
    -- TEST 1: Anonymous User (Public client)
    -- =========================================================================
    INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 1', 'INFO', 'Running queries as Anonymous User');
    
    -- Mock Anon Role & JWT claims
    SET LOCAL role TO anon;
    SET LOCAL "request.jwt.claims" TO '{"sub": null, "role": "anon"}';

    -- Expectation: Can read games
    IF EXISTS (SELECT 1 FROM games WHERE slug = 'test-rls') THEN
        INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 1.1', 'PASSED', 'Anon can read games');
    ELSE
        RAISE EXCEPTION 'TEST 1.1 FAILED: Anon cannot read games';
    END IF;

    -- Expectation: Can read available account
    IF EXISTS (SELECT 1 FROM accounts WHERE id = v_acc_avail_id) THEN
        INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 1.2', 'PASSED', 'Anon can read available accounts');
    ELSE
        RAISE EXCEPTION 'TEST 1.2 FAILED: Anon cannot read available account';
    END IF;

    -- Expectation: Cannot read sold account
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = v_acc_sold_id) THEN
        INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 1.3', 'PASSED', 'Anon cannot read sold accounts');
    ELSE
        RAISE EXCEPTION 'TEST 1.3 FAILED: Anon can read sold account';
    END IF;

    -- Expectation: Cannot read any credentials
    IF NOT EXISTS (SELECT 1 FROM account_credentials) THEN
        INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 1.4', 'PASSED', 'Anon cannot read any credentials');
    ELSE
        RAISE EXCEPTION 'TEST 1.4 FAILED: Anon can read account credentials';
    END IF;

    -- Expectation: Cannot insert orders
    BEGIN
        INSERT INTO orders (user_id, account_id, amount, payment_status, payment_code, buyer_email)
        VALUES ('00000000-0000-0000-0000-000000000001', v_acc_avail_id, 100000, 'pending', 'GMISERR', 'anon@gmios.com');
        RAISE EXCEPTION 'TEST 1.5 FAILED: Anon allowed to insert order';
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 1.5', 'PASSED', 'Anon blocked from inserting orders');
    END;

    -- =========================================================================
    -- TEST 2: Authenticated User (Buyer)
    -- =========================================================================
    INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 2', 'INFO', 'Running queries as Authenticated Buyer');
    
    -- Mock Authenticated Buyer Role & JWT claims
    SET LOCAL role TO authenticated;
    SET LOCAL "request.jwt.claims" TO '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

    -- Expectation: Can read available accounts
    IF EXISTS (SELECT 1 FROM accounts WHERE id = v_acc_avail_id) THEN
        INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 2.1', 'PASSED', 'Buyer can read available accounts');
    ELSE
        RAISE EXCEPTION 'TEST 2.1 FAILED: Buyer cannot read available accounts';
    END IF;

    -- Expectation: Can read their purchased sold account
    IF EXISTS (SELECT 1 FROM accounts WHERE id = v_acc_sold_id) THEN
        INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 2.2', 'PASSED', 'Buyer can read their purchased sold account');
    ELSE
        RAISE EXCEPTION 'TEST 2.2 FAILED: Buyer cannot read their purchased sold account';
    END IF;

    -- Expectation: Can read credentials of their purchased sold account
    IF EXISTS (SELECT 1 FROM account_credentials WHERE account_id = v_acc_sold_id) THEN
        INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 2.3', 'PASSED', 'Buyer can read credentials of their purchased account');
    ELSE
        RAISE EXCEPTION 'TEST 2.3 FAILED: Buyer cannot read credentials of their purchased account';
    END IF;

    -- Expectation: Cannot read credentials of unpurchased available account
    IF NOT EXISTS (SELECT 1 FROM account_credentials WHERE account_id = v_acc_avail_id) THEN
        INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 2.4', 'PASSED', 'Buyer cannot read credentials of available unpurchased accounts');
    ELSE
        RAISE EXCEPTION 'TEST 2.4 FAILED: Buyer can read credentials of available unpurchased account';
    END IF;

    -- Expectation: Can create order for themselves
    BEGIN
        INSERT INTO orders (user_id, account_id, amount, payment_status, payment_code, buyer_email)
        VALUES ('00000000-0000-0000-0000-000000000001', v_acc_avail_id, 100000, 'pending', 'GMISTESTOK1', 'buyer@gmios.com');
        INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 2.5', 'PASSED', 'Buyer can create orders for themselves');
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'TEST 2.5 FAILED: Buyer blocked from creating order for themselves: %', SQLERRM;
    END;

    -- Expectation: Cannot create order for others
    BEGIN
        INSERT INTO orders (user_id, account_id, amount, payment_status, payment_code, buyer_email)
        VALUES ('00000000-0000-0000-0000-000000000002', v_acc_avail_id, 100000, 'pending', 'GMISTESTFAIL1', 'hacker@gmios.com');
        RAISE EXCEPTION 'TEST 2.6 FAILED: Buyer allowed to create order for someone else';
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 2.6', 'PASSED', 'Buyer blocked from creating order for someone else');
    END;

    -- =========================================================================
    -- TEST 3: Authenticated User (Non-Buyer / Hacker)
    -- =========================================================================
    INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 3', 'INFO', 'Running queries as Authenticated Non-Buyer');

    -- Mock Authenticated Non-Buyer Role & JWT claims
    SET LOCAL role TO authenticated;
    SET LOCAL "request.jwt.claims" TO '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

    -- Expectation: Cannot read credentials of sold account (which they did not purchase)
    IF NOT EXISTS (SELECT 1 FROM account_credentials WHERE account_id = v_acc_sold_id) THEN
        INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 3.1', 'PASSED', 'Non-buyer blocked from reading credentials of sold account');
    ELSE
        RAISE EXCEPTION 'TEST 3.1 FAILED: Non-buyer can read credentials of sold account';
    END IF;

    -- Expectation: Cannot read metadata of sold account
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = v_acc_sold_id) THEN
        INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 3.2', 'PASSED', 'Non-buyer blocked from reading metadata of sold account');
    ELSE
        RAISE EXCEPTION 'TEST 3.2 FAILED: Non-buyer can read metadata of sold account';
    END IF;

    -- Expectation: Cannot view order of the buyer
    IF NOT EXISTS (SELECT 1 FROM orders WHERE payment_code = 'GMISTESTPAID') THEN
        INSERT INTO test_logs (test_case, status, details) VALUES ('TEST 3.3', 'PASSED', 'Non-buyer blocked from viewing buyer''s order');
    ELSE
        RAISE EXCEPTION 'TEST 3.3 FAILED: Non-buyer can view buyer''s order';
    END IF;

    INSERT INTO test_logs (test_case, status, details) VALUES ('SUCCESS', 'SUCCESS', 'ALL RLS VERIFICATION TESTS PASSED SUCCESSFULLY');
END $$;

-- Retrieve and return the test logs as a beautiful table in Supabase Results pane
SELECT test_case, status, details FROM test_logs ORDER BY id;

ROLLBACK;