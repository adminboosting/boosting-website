import { z } from "zod";

/**
 * Zod schemas for the auth surfaces (sign-up / sign-in server actions) and the
 * credential vault submission form. Every external input crossing an action
 * boundary is validated here; the actions never read unvalidated fields.
 */

// RFC 5321 caps an address at 254 chars; Supabase enforces its own rules on
// top, this just rejects garbage before it leaves the server action.
const emailSchema = z.email().max(254);

// 72 bytes is the bcrypt input limit Supabase Auth inherits; 8 is its default
// minimum password length.
const passwordSchema = z.string().min(8).max(72);

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().max(60).optional(),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

/**
 * Game-account credentials a customer submits for a piloted order. Validated
 * shape only — the payload is JSON-stringified and AES-256-GCM encrypted by
 * lib/credentials/vault.ts before anything touches the database.
 */
export const credentialSubmissionSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
  note: z.string().max(500).optional(),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type CredentialSubmission = z.infer<typeof credentialSubmissionSchema>;
