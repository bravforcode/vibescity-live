import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
	apiVersion: "2022-11-15",
	httpClient: Stripe.createFetchHttpClient(),
});

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

const applyEntitlementsBySku = async (
	supabase: ReturnType<typeof createClient>,
	venueId: string,
	sku: string,
	purchaseMode: string,
) => {
	if (!venueId || !sku) return;
	const nowIso = new Date().toISOString();
	const lower = sku.toLowerCase();

	if (lower === "giant_monthly") {
		await supabase
			.from("venues")
			.update({
				pin_type: "giant",
				giant_until: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
			})
			.eq("id", venueId);
		return;
	}

	if (lower === "video_pin") {
		await supabase
			.from("venues")
			.update({
				pin_metadata: {
					video_enabled: true,
					updated_at: nowIso,
					purchase_mode: purchaseMode,
				},
				boost_until:
					purchaseMode === "subscription"
						? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
						: null,
			})
			.eq("id", venueId);
		return;
	}

	if (lower === "vip_bundle") {
		await supabase
			.from("venues")
			.update({
				is_verified: true,
				pin_type: "giant",
				verified_until: new Date(
					Date.now() + 30 * 24 * 3600 * 1000,
				).toISOString(),
				giant_until: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
				boost_until: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
			})
			.eq("id", venueId);
	}
};

const upsertOrder = async (
	supabase: ReturnType<typeof createClient>,
	payload: Record<string, unknown>,
) => {
	const { data, error } = await supabase
		.from("orders")
		.upsert(payload, { onConflict: "provider,provider_order_id" })
		.select("*")
		.single();
	if (error) throw error;
	return data;
};

serve(async (req) => {
	const signature = req.headers.get("stripe-signature");
	if (!signature) return new Response("Missing signature", { status: 400 });

	const body = await req.text();
	let event: Stripe.Event;
	try {
		event = await stripe.webhooks.constructEventAsync(
			body,
			signature,
			WEBHOOK_SECRET,
		);
	} catch (err) {
		console.error("[stripe-webhook] signature verification failed", err?.message || err);
		return new Response("Invalid signature", { status: 400 });
	}

	const supabase = createClient(
		Deno.env.get("SUPABASE_URL") ?? "",
		Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
	);

	const { error: idempotencyError } = await supabase
		.from("stripe_webhook_events")
		.insert({
			stripe_event_id: event.id,
			event_type: event.type,
			payload: event,
			processed_at: null,
		});
	if (idempotencyError) {
		if (idempotencyError.code === "23505") {
			return new Response("Idempotent", { status: 200 });
		}
		console.error("[stripe-webhook] idempotency insert error", idempotencyError);
		return new Response("Database error", { status: 500 });
	}

	try {
		if (event.type === "checkout.session.completed") {
			const session = event.data.object as Stripe.Checkout.Session;
			const metadata = session.metadata || {};
			const venueId = String(metadata.venue_id || "");
			const sku = String(metadata.sku || "").toLowerCase();
			const purchaseMode = String(
				metadata.purchase_mode ||
					(session.mode === "subscription" ? "subscription" : "one_time"),
			);
			const stripeSubId =
				typeof session.subscription === "string" ? session.subscription : null;
			const stripePaymentIntent =
				typeof session.payment_intent === "string" ? session.payment_intent : null;

			const order = await upsertOrder(supabase, {
				provider: "stripe",
				provider_order_id: session.id,
				user_id: metadata.user_id || null,
				venue_id: venueId || null,
				visitor_id: metadata.visitor_id || null,
				partner_id: metadata.partner_id || null,
				sku,
				total_amount: Number(session.amount_total || 0) / 100.0,
				amount: Number(session.amount_total || 0) / 100.0,
				status: "paid",
				payment_method: "stripe",
				purchase_mode: purchaseMode,
				subscription_status:
					session.mode === "subscription" ? "active" : "none",
				stripe_subscription_id: stripeSubId,
				metadata: {
					stripe_session_id: session.id,
					stripe_customer_id: session.customer || null,
					stripe_payment_intent: stripePaymentIntent,
					partner_code: metadata.partner_code || null,
				},
				updated_at: new Date().toISOString(),
			});

			if (session.mode === "subscription" && stripeSubId) {
				await supabase.from("subscriptions").upsert(
					{
						stripe_subscription_id: stripeSubId,
						venue_id: venueId || null,
						visitor_id: metadata.visitor_id || null,
						user_id: metadata.user_id || null,
						stripe_customer_id: session.customer || null,
						status: "active",
						plan_id: session?.metadata?.sku || null,
						updated_at: new Date().toISOString(),
					},
					{ onConflict: "stripe_subscription_id" },
				);
			}

			await applyEntitlementsBySku(supabase, venueId, sku, purchaseMode);
			if (metadata.partner_id && venueId) {
				await supabase.from("partner_referrals").upsert(
					{
						partner_id: metadata.partner_id,
						venue_id: venueId,
						source: metadata.partner_code ? "code" : "link",
						referral_code: metadata.partner_code || null,
						attributed_at: new Date().toISOString(),
					},
					{ onConflict: "partner_id,venue_id" },
				);
			}

			// Commission accrual (20%) if partner attribution exists.
			if (order?.partner_id && order?.amount) {
				const amount = Number(order.amount || 0) * 0.2;
				if (amount > 0) {
					await supabase.from("partner_commission_ledger").insert({
						partner_id: order.partner_id,
						order_id: order.id,
						venue_id: venueId || null,
						entry_type: "accrual",
						amount_thb: Number(amount.toFixed(2)),
						status: "accrued",
						period_start: new Date().toISOString(),
						period_end: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
						metadata: { source: "stripe_checkout_completed" },
					});
				}
			}
		}

		if (event.type === "invoice.payment_succeeded") {
			const invoice = event.data.object as Stripe.Invoice;
			const stripeSubId =
				typeof invoice.subscription === "string" ? invoice.subscription : null;
			if (stripeSubId) {
				await supabase
					.from("subscriptions")
					.update({
						status: "active",
						current_period_end: invoice.period_end
							? new Date(invoice.period_end * 1000).toISOString()
							: null,
						updated_at: new Date().toISOString(),
					})
					.eq("stripe_subscription_id", stripeSubId);

				await supabase
					.from("orders")
					.update({
						subscription_status: "active",
						renewal_at: invoice.period_end
							? new Date(invoice.period_end * 1000).toISOString()
							: null,
						updated_at: new Date().toISOString(),
					})
					.eq("stripe_subscription_id", stripeSubId);
			}
		}

		if (event.type === "invoice.payment_failed") {
			const invoice = event.data.object as Stripe.Invoice;
			const stripeSubId =
				typeof invoice.subscription === "string" ? invoice.subscription : null;
			if (stripeSubId) {
				await supabase
					.from("subscriptions")
					.update({ status: "past_due", updated_at: new Date().toISOString() })
					.eq("stripe_subscription_id", stripeSubId);

				await supabase
					.from("orders")
					.update({
						subscription_status: "past_due",
						updated_at: new Date().toISOString(),
					})
					.eq("stripe_subscription_id", stripeSubId);
			}
		}

		if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
			const sub = event.data.object as Stripe.Subscription;
			await supabase
				.from("subscriptions")
				.upsert(
					{
						stripe_subscription_id: sub.id,
						venue_id: sub.metadata?.venue_id || null,
						visitor_id: sub.metadata?.visitor_id || null,
						stripe_customer_id: sub.customer || null,
						status: sub.status,
						current_period_end: sub.current_period_end
							? new Date(sub.current_period_end * 1000).toISOString()
							: null,
						cancel_at_period_end: sub.cancel_at_period_end,
						plan_id: sub.items?.data?.[0]?.price?.id || null,
						updated_at: new Date().toISOString(),
					},
					{ onConflict: "stripe_subscription_id" },
				);

			await supabase
				.from("orders")
				.update({
					subscription_status:
						event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
					updated_at: new Date().toISOString(),
				})
				.eq("stripe_subscription_id", sub.id);
		}

		if (event.type === "charge.refunded") {
			const charge = event.data.object as Stripe.Charge;
			const providerOrderId = String(charge.payment_intent || "");
			if (providerOrderId) {
				let { data: orders } = await supabase
					.from("orders")
					.select("id,partner_id,amount,venue_id")
					.eq("provider_order_id", providerOrderId)
					.limit(1);

				if (!orders || orders.length === 0) {
					const fallback = await supabase
						.from("orders")
						.select("id,partner_id,amount,venue_id")
						.contains("metadata", {
							stripe_payment_intent: providerOrderId,
						})
						.limit(1);
					orders = fallback.data || [];
				}
				const order = (orders || [])[0];

				if (order?.id) {
					await supabase
						.from("orders")
						.update({
							status: "refunded",
							subscription_status: "refunded",
							updated_at: new Date().toISOString(),
						})
						.eq("id", order.id);
				}

				if (order?.partner_id) {
					await supabase.from("partner_commission_ledger").insert({
						partner_id: order.partner_id,
						order_id: order.id,
						venue_id: order.venue_id || null,
						entry_type: "clawback",
						amount_thb: -Math.abs(Number(order.amount || 0) * 0.2),
						status: "accrued",
						period_start: new Date().toISOString(),
						period_end: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
						metadata: { source: "charge_refunded" },
					});
				}
			}
		}

		await supabase
			.from("stripe_webhook_events")
			.update({ processed_at: new Date().toISOString() })
			.eq("stripe_event_id", event.id);

		return new Response(JSON.stringify({ received: true }), {
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		console.error("[stripe-webhook] processing error", err?.message || err);
		return new Response(`Webhook Error: ${err?.message || err}`, { status: 400 });
	}
});
