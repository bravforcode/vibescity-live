import { z } from "zod";

export const shopSchema = z.object({
	name: z.string().min(1, "Name is required").max(100),
	category: z.string().min(1, "Category is required"),
	sub_category: z.string().optional(),
	description: z.string().optional(),
	lat: z.number().min(-90).max(90),
	lng: z.number().min(-180).max(180),
	address: z.string().optional(),
	phone: z.string().optional(),
	website: z.string().url().optional().or(z.literal("")),
	facebook: z.string().url().optional().or(z.literal("")),
	instagram: z.string().url().optional().or(z.literal("")),
	line_id: z.string().optional(),
	images: z.array(z.string().url()).optional(),
	open_time: z
		.string()
		.regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)")
		.optional(),
	close_time: z
		.string()
		.regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)")
		.optional(),
	is_active: z.boolean().default(true),
});
