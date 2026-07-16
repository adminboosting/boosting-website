import { describe, expect, it } from "vitest";
import { chatMessageSchema, progressNoteSchema, reviewSchema } from "@/lib/schemas/chat";

describe("chatMessageSchema", () => {
  it("accepts a normal message and trims it", () => {
    const parsed = chatMessageSchema.parse({ body: "  On my way to Gold II.  " });
    expect(parsed.body).toBe("On my way to Gold II.");
  });

  it("rejects an empty body", () => {
    expect(chatMessageSchema.safeParse({ body: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only body (trim happens before min)", () => {
    expect(chatMessageSchema.safeParse({ body: "   \n\t  " }).success).toBe(false);
  });

  it("accepts exactly 2000 chars and rejects 2001 (DB has no CHECK — this is the only limit)", () => {
    expect(chatMessageSchema.safeParse({ body: "m".repeat(2000) }).success).toBe(true);
    expect(chatMessageSchema.safeParse({ body: "m".repeat(2001) }).success).toBe(false);
  });

  it("rejects a missing body", () => {
    expect(chatMessageSchema.safeParse({}).success).toBe(false);
  });
});

describe("reviewSchema", () => {
  it("accepts a valid review", () => {
    const parsed = reviewSchema.parse({ rating: 5, body: "Fast and friendly." });
    expect(parsed.rating).toBe(5);
    expect(parsed.body).toBe("Fast and friendly.");
  });

  it("coerces a form-data string rating", () => {
    expect(reviewSchema.parse({ rating: "4" }).rating).toBe(4);
  });

  it("rejects rating 0", () => {
    expect(reviewSchema.safeParse({ rating: 0 }).success).toBe(false);
  });

  it("rejects rating 6", () => {
    expect(reviewSchema.safeParse({ rating: 6 }).success).toBe(false);
  });

  it("rejects a fractional rating (2.5)", () => {
    expect(reviewSchema.safeParse({ rating: 2.5 }).success).toBe(false);
  });

  it("collapses a blank body to undefined", () => {
    expect(reviewSchema.parse({ rating: 3, body: "   " }).body).toBeUndefined();
    expect(reviewSchema.parse({ rating: 3 }).body).toBeUndefined();
  });

  it("rejects an overlong body (> 2000 chars)", () => {
    expect(reviewSchema.safeParse({ rating: 3, body: "r".repeat(2001) }).success).toBe(false);
  });

  it("never accepts an is_published field (moderation is server-side)", () => {
    const parsed = reviewSchema.parse({ rating: 4, is_published: true });
    expect(parsed).not.toHaveProperty("is_published");
  });
});

describe("progressNoteSchema", () => {
  it("accepts and trims a note", () => {
    expect(progressNoteSchema.parse({ note: "  Halfway there.  " }).note).toBe("Halfway there.");
  });

  it("collapses a blank note to undefined", () => {
    expect(progressNoteSchema.parse({ note: "" }).note).toBeUndefined();
    expect(progressNoteSchema.parse({}).note).toBeUndefined();
  });

  it("accepts exactly 500 chars and rejects 501", () => {
    expect(progressNoteSchema.safeParse({ note: "n".repeat(500) }).success).toBe(true);
    expect(progressNoteSchema.safeParse({ note: "n".repeat(501) }).success).toBe(false);
  });
});
