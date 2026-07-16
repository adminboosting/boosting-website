import { z } from "zod";

/**
 * Zod schemas for the chat / review / progress inputs crossing server-action
 * boundaries in Phase 3. Pure module (no "server-only") — imported by client
 * components for pre-flight validation AND by the actions, which re-parse
 * server-side regardless (client validation is UX, never enforcement).
 */

/** Collapse a blank/whitespace-only string to undefined before validating. */
const blankToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/**
 * A chat message body. The DB has NO length CHECK on order_messages.body —
 * this schema is the only limit, so every insert path must parse through it.
 */
export const chatMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

/**
 * A customer review of their completed order. Rating is coerced (form data
 * arrives as strings); a blank body collapses to undefined rather than storing
 * an empty string. `is_published` is deliberately ABSENT: publishing is
 * moderation (0007 policy + hardcoded false in the action), never client input.
 */
export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  body: z.preprocess(blankToUndefined, z.string().trim().max(2000).optional()),
});

/** Optional note attached to a booster/admin progress event. */
export const progressNoteSchema = z.object({
  note: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type ProgressNoteInput = z.infer<typeof progressNoteSchema>;
