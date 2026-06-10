-- Migration: 20260608000000_admin_roles_and_policies.sql
-- Goal: 
-- 1. Create user_roles table to manage 'customer' and 'admin' privileges.
-- 2. Automatically assign 'customer' role on user creation via trigger.
-- 3. Define helper function to check admin privileges securely.
-- 4. Enable RLS and configure administrative CRUD policies on all tables.

-- 1. Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2. Create is_admin helper function
-- Marked as SECURITY DEFINER and using SET search_path to public to safely bypass RLS checks and avoid recursion.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Set RLS Policies for user_roles table
-- Allow users to read their own role
CREATE POLICY "Allow users to read their own role" ON public.user_roles
    FOR SELECT TO authenticated USING (auth.uid() = id);

-- Allow admins to perform CRUD operations on user_roles
CREATE POLICY "Allow admins to manage all roles" ON public.user_roles
    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 4. Create trigger to assign default 'customer' role for new auth users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_roles (id, role)
    VALUES (new.id, 'customer')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 5. Backfill existing users (if any) with default 'customer' role
INSERT INTO public.user_roles (id, role)
SELECT id, 'customer'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 6. Configure Administrative Policies on other tables

-- Allow admins to manage games (CRUD)
CREATE POLICY "Allow admins to manage games" ON public.games
    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Allow admins to manage accounts (CRUD)
CREATE POLICY "Allow admins to manage accounts" ON public.accounts
    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Allow admins to manage account_credentials (CRUD)
CREATE POLICY "Allow admins to manage account credentials" ON public.account_credentials
    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Allow admins to manage orders (CRUD)
CREATE POLICY "Allow admins to manage orders" ON public.orders
    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
