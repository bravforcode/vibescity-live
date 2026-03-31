-- ==========================================
-- RPC: Promote to Giant (Admin Tool)
-- ==========================================

create or replace function public.promote_to_giant(
  p_shop_id bigint,
  p_giant_category text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
as $$
begin
  update public.shops
  set pin_type='giant',
      pin_metadata =
        jsonb_set(
          jsonb_set(
            coalesce(pin_metadata,'{}'::jsonb),
            '{giant_category}',
            to_jsonb(p_giant_category),
            true
          ),
          '{model_scale}',
          coalesce(p_metadata->'model_scale','1.2'::jsonb),
          true
        )
        || p_metadata,
      visibility_score = greatest(visibility_score, 1000)
  where id = p_shop_id;
end $$;
