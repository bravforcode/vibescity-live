SELECT t.typname, e.enumlabel
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname IN ('venue_status', 'order_status', 'subscription_status', 'partner_status');
