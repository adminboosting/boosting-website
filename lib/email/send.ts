import "server-only";

/**
 * Minimal transactional-email sender built on Resend's REST API — no SDK
 * dependency (the owner's constraint is "completely free, few moving parts";
 * a single fetch keeps the bundle and the audit surface small).
 *
 * Degradation is deliberate and matches .env.example: when RESEND_API_KEY is
 * unset (local dev, or before the domain is verified) the email is LOGGED, not
 * sent, and the caller still gets `{ ok: true, skipped: true }`. Nothing that
 * depends on email should fail because email isn't configured yet.
 *
 * The From address comes from EMAIL_FROM. Until a domain is verified in Resend,
 * Resend only accepts its shared `onboarding@resend.dev` sender; once
 * rankedfrogs.com is verified, set EMAIL_FROM to e.g.
 * `RankedFrogs <noreply@rankedfrogs.com>` (see RUNBOOK).
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "RankedFrogs <onboarding@resend.dev>";

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Rendered HTML body. */
  html: string;
  /** Plain-text fallback; strongly recommended for deliverability. */
  text: string;
  /** Optional Reply-To (e.g. support@rankedfrogs.com). */
  replyTo?: string;
}

export type SendEmailResult =
  | { ok: true; skipped: false; id: string }
  | { ok: true; skipped: true }
  | { ok: false; error: string };

/** True when a real Resend key is configured (not blank, not the placeholder). */
export function isEmailConfigured(): boolean {
  const key = process.env.RESEND_API_KEY;
  return Boolean(key) && key !== "your-resend-api-key";
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;

  if (!isEmailConfigured()) {
    // Visible in dev; on the live project this only prints if the key was
    // removed. Never log the body — subjects/recipients only.
    console.info(`[email] skipped (RESEND_API_KEY unset) → to=${input.to} subject=${input.subject}`);
    return { ok: true, skipped: true };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      // Resend returns a JSON { message } on error; keep it out of the caller's
      // return value (could echo the recipient) and log server-side only.
      const detail = await response.text().catch(() => "");
      console.error(`[email] Resend responded ${response.status}: ${detail.slice(0, 300)}`);
      return { ok: false, error: "Email could not be sent." };
    }

    const data = (await response.json().catch(() => ({}))) as { id?: string };
    return { ok: true, skipped: false, id: data.id ?? "" };
  } catch (error) {
    console.error("[email] Resend request failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "Email could not be sent." };
  }
}
