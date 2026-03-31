import { describe, it, expect } from "vitest";
import * as schemas from "../../src/schemas/index.js";

describe("Centralized Schemas Validation", () => {
	describe("UserProfileSchema", () => {
		it("should validate a correct user profile", () => {
			const validUser = {
				id: "user_123",
				username: "vibe_explorer",
				email: "test@vibecity.live",
				phone: "+66812345678",
			};
			expect(schemas.UserProfileSchema.parse(validUser)).toEqual(validUser);
		});

		it("should fail on invalid email", () => {
			const invalidUser = {
				id: 1,
				username: "user",
				email: "invalid-email",
			};
			const result = schemas.UserProfileSchema.safeParse(invalidUser);
			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.format();
				expect(errors.email?._errors).toContain("รูปแบบอีเมลไม่ถูกต้อง");
			}
		});
	});

	describe("VenueSchema", () => {
		it("should validate a correct venue", () => {
			const validVenue = {
				id: 101,
				name: "Vibe Cafe",
				slug: "vibe-cafe",
				lat: 13.75,
				lng: 100.5,
				status: "LIVE",
			};
			expect(schemas.VenueSchema.parse(validVenue)).toEqual(expect.objectContaining(validVenue));
		});

		it("should fail if name is missing", () => {
			const invalidVenue = {
				id: 101,
				slug: "vibe-cafe",
				lat: 13.75,
				lng: 100.5,
			};
			const result = schemas.VenueSchema.safeParse(invalidVenue);
			expect(result.success).toBe(false);
		});
	});

	describe("ReviewSchema", () => {
		it("should validate a correct review", () => {
			const validReview = {
				id: "rev_1",
				venue_id: 101,
				rating: 5,
				comment: "Great place!",
				userName: "John Doe",
			};
			expect(schemas.ReviewSchema.parse(validReview)).toEqual(expect.objectContaining(validReview));
		});

		it("should fail if rating is out of range", () => {
			const invalidReview = {
				id: "rev_1",
				venue_id: 101,
				rating: 6,
				comment: "Too good!",
			};
			expect(schemas.ReviewSchema.safeParse(invalidReview).success).toBe(false);
		});
	});
});
