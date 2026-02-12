import { supabase } from "../lib/supabase";

const sanitizeCode = (value) =>
	String(value || "")
		.trim()
		.replace(/[^a-zA-Z0-9_-]/g, "")
		.toUpperCase()
		.slice(0, 24);

export const partnerService = {
	sanitizeCode,

	async getMyPartnerProfile() {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (!user?.id) return null;

		const { data, error } = await supabase
			.from("partners")
			.select("*")
			.eq("user_id", user.id)
			.maybeSingle();
		if (error) throw error;
		return data || null;
	},

	async createPartnerProfile({ displayName, referralCode }) {
		const { data, error } = await supabase.rpc("create_partner_profile", {
			p_display_name: String(displayName || "").trim(),
			p_referral_code: sanitizeCode(referralCode) || null,
		});
		if (error) throw error;
		return data || null;
	},

	async getDashboardMetrics() {
		const { data, error } = await supabase.rpc("get_partner_dashboard_metrics");
		if (error) throw error;
		return Array.isArray(data) ? data[0] || null : data || null;
	},

	async getRecentReferrals(partnerId, limit = 20) {
		if (!partnerId) return [];
		const { data, error } = await supabase
			.from("partner_referrals")
			.select("id,venue_id,source,referral_code,attributed_at")
			.eq("partner_id", partnerId)
			.order("attributed_at", { ascending: false })
			.limit(limit);
		if (error) throw error;
		return data || [];
	},

	async getRecentPayouts(partnerId, limit = 12) {
		if (!partnerId) return [];
		const { data, error } = await supabase
			.from("partner_payouts")
			.select(
				"id,payout_week_start,payout_week_end,net_amount_thb,status,transfer_reference,paid_at",
			)
			.eq("partner_id", partnerId)
			.order("payout_week_end", { ascending: false })
			.limit(limit);
		if (error) throw error;
		return data || [];
	},

	async getLedgerEntries(partnerId, limit = 30) {
		if (!partnerId) return [];
		const { data, error } = await supabase
			.from("partner_commission_ledger")
			.select(
				"id,entry_type,amount_thb,status,period_end,created_at,order_id,venue_id",
			)
			.eq("partner_id", partnerId)
			.order("created_at", { ascending: false })
			.limit(limit);
		if (error) throw error;
		return data || [];
	},

	async upsertBankSecrets({
		bankCode,
		accountName,
		accountNumber,
		promptpayId,
	}) {
		const { error } = await supabase.rpc("upsert_partner_secrets", {
			p_bank_code: String(bankCode || "").toUpperCase(),
			p_account_name: String(accountName || "").trim(),
			p_account_number: String(accountNumber || "").trim() || null,
			p_promptpay_id: String(promptpayId || "").trim() || null,
		});
		if (error) throw error;
	},
};
