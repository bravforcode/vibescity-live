import { z } from "zod";

/**
 * 🛠️ Common Base Schemas
 */
export const TimestampSchema = z.string().datetime();
export const UuidSchema = z
	.string()
	.uuid({ message: "รูปแบบ ID ไม่ถูกต้อง (UUID)" });
export const CoordinatesSchema = z.object({
	lat: z.number().min(-90).max(90),
	lng: z.number().min(-180).max(180),
});

/**
 * 👤 User & Profile Schemas
 */
export const UserProfileSchema = z.object({
	id: z.string().or(z.number()),
	username: z.string().min(3, "ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร").max(50),
	email: z.string().email("รูปแบบอีเมลไม่ถูกต้อง"),
	avatar_url: z.string().url().optional().nullable(),
	full_name: z.string().max(100).optional().nullable(),
	phone: z
		.string()
		.regex(/^[0-9+-\s]+$/, "รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง")
		.optional()
		.nullable(),
	created_at: TimestampSchema.optional(),
});

/**
 * 🏪 Shop & Venue Schemas
 */
export const VenueSchema = z.object({
	id: z.string().or(z.number()),
	name: z.string().min(1, "กรุณาระบุชื่อสถานที่"),
	slug: z.string().min(1, "Slug ไม่ถูกต้อง"),
	category: z.string().optional(),
	status: z.enum(["LIVE", "PENDING", "DELETED", "ALL"]).default("LIVE"),
	lat: z.number(),
	lng: z.number(),
	rating: z.number().min(0).max(5).optional().nullable(),
	view_count: z.number().int().nonnegative().default(0),
	image_urls: z.array(z.string().url()).default([]),
	is_verified: z.boolean().default(false),
});

/**
 * 📝 Review & UGC Schemas
 */
export const ReviewSchema = z.object({
	id: z.string().or(z.number()),
	venue_id: z.string().or(z.number()),
	rating: z.number().min(0, "คะแนนต้องไม่ต่ำกว่า 0").max(5).optional().nullable(),
	comment: z.string().max(500, "ความคิดเห็นต้องไม่เกิน 500 ตัวอักษร"),
	userName: z.string().min(1, "กรุณาระบุชื่อผู้แสดงความเห็น").default("Vibe Explorer"),
	created_at: TimestampSchema.optional(),
});

/**
 * 🗺️ Traffic & Map Schemas
 */
export const TrafficStatusSchema = z.object({
	status: z.string(),
	providers: z.record(z.string(), z.string()),
});

/**
 * 🔑 Auth & Visitor Schemas
 */
export const VisitorBootstrapSchema = z.object({
	visitor_id: z.string().uuid(),
	visitor_token: z.string().min(10),
	expires_at: z.number().optional(),
});

/**
 * 🚗 Ride & Transport Schemas
 */
export const RideEstimateSchema = z.object({
	provider: z.string(),
	price: z.number().nonnegative(),
	currency: z.string().length(3),
	duration_min: z.number().int().nonnegative(),
	deep_link: z.string().url().optional(),
});
