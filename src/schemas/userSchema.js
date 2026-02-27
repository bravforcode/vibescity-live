import { z } from "zod";

export const userSchema = z.object({
	username: z
		.string()
		.min(3, "Username must be at least 3 characters")
		.max(30)
		.optional(),
	full_name: z.string().max(100).optional(),
	bio: z.string().max(500).optional(),
	website: z.string().url().optional().or(z.literal("")),
	avatar_url: z.string().url().optional().or(z.literal("")),
});
