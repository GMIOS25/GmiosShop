-- Migration: 20260616000000_scheduled_order_expiration.sql
-- Goal: 
-- 1. Enable pg_cron extension.
-- 2. Create a function to automatically set pending orders older than 5 minutes to 'expired'.
-- 3. Register a pg_cron job to run every minute and execute the function.

-- 1. Enable pg_cron extension if not already present
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Create helper function to expire overdue orders (older than 5 minutes)
CREATE OR REPLACE FUNCTION public.expire_overdue_orders()
RETURNS VOID AS $$
BEGIN
    UPDATE public.orders
    SET payment_status = 'expired'
    WHERE payment_status = 'pending'
      AND created_at < now() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Schedule the function using pg_cron to run every 1 minute
-- Unschedule first if already scheduled to ensure re-runnability without duplicate jobs
SELECT cron.unschedule(jobid) 
FROM cron.job 
WHERE jobname = 'expire-orders-every-minute';

-- Schedule the job
SELECT cron.schedule(
    'expire-orders-every-minute', -- Unique job name
    '* * * * *',                  -- Cron schedule (every minute)
    'SELECT public.expire_overdue_orders();'
);
