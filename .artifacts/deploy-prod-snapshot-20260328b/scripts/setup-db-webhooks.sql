-- Enable the pg_net extension to make HTTP requests
create extension if not exists pg_net;

-- Create a trigger function that calls the Edge Function
create or replace function public.trigger_webhook_handler()
returns trigger as $$
declare
  response_id uuid;
begin
  -- Replace with your actual Edge Function URL
  -- NOTE: In production, use the project secret via a secure method or hardcode if necessary
  -- Here we use net.http_post
  select net.http_post(
      url := 'https://nluuvnttweesnkrmgzsm.supabase.co/functions/v1/webhook-handler',
      headers := '{"Content-Type": "application/json", "x-webhook-secret": "vibecity_secret_key"}'::jsonb,
      body := jsonb_build_object(
          'type', TG_OP,
          'table', TG_TABLE_NAME,
          'schema', TG_TABLE_SCHEMA,
          'record', row_to_json(NEW),
          'old_record', row_to_json(OLD)
      )
  ) into response_id;

  return NEW;
end;
$$ language plpgsql security definer;

-- Trigger for SHOPS (Update)
drop trigger if exists on_shop_update on public.shops;
create trigger on_shop_update
  after update on public.shops
  for each row
  execute function public.trigger_webhook_handler();

-- Trigger for SHOPS (Insert)
drop trigger if exists on_shop_insert on public.shops;
create trigger on_shop_insert
  after insert on public.shops
  for each row
  execute function public.trigger_webhook_handler();

-- Trigger for EVENTS (Insert)
drop trigger if exists on_event_insert on public.events;
create trigger on_event_insert
  after insert on public.events
  for each row
  execute function public.trigger_webhook_handler();

-- Trigger for REVIEWS (Insert - for Gamification)
-- Assuming you have a reviews table, otherwise skip
-- drop trigger if exists on_review_insert on public.reviews;
-- create trigger on_review_insert
--   after insert on public.reviews
--   for each row
--   execute function public.trigger_webhook_handler();
