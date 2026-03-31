import { z } from "zod";

export const ShopSchema = z.object({
	id: z.string(),
	name: z.string(),
	category: z.string(),
	status: z.enum(["LIVE", "TONIGHT", "OFF"]).optional(),
	coordinate: z
		.object({
			lat: z.number(),
			lng: z.number(),
		})
		.optional(),
	videos: z.array(z.string()).optional(),
});

export const UserSchema = z.object({
	id: z.string(),
	username: z.string(),
	email: z.string().email(),
});
