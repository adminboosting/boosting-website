import "server-only";
import { BRAND_NAME, getSiteUrl, SUPPORT_EMAIL_FALLBACK } from "@/lib/config";
import type { SendEmailInput } from "@/lib/email/send";

/**
 * Transactional email bodies. Pure builders (input → SendEmailInput) so the
 * copy is testable and the action stays about orchestration. Plain, inline
 * styles only — email clients strip <style> and external CSS.
 */

/** Short, human order reference — the same 8-char slice the order pages show. */
function shortOrderId(orderId: string): string {
  return orderId.slice(0, 8);
}

/**
 * Booster → customer: "your booster left you a message". Deliberately content-
 * free about the message itself (the thread may contain account details) — it
 * only nudges the customer back to the order page to read it in-app.
 */
export function boosterMessageEmail(params: {
  to: string;
  orderId: string;
  displayName?: string | null;
}): SendEmailInput {
  const ref = shortOrderId(params.orderId);
  const orderUrl = `${getSiteUrl()}/orders/${params.orderId}`;
  const hi = params.displayName ? `Hi ${params.displayName},` : "Hi,";

  const text = [
    hi,
    "",
    `Your booster just sent you a message about order #${ref}.`,
    "",
    `Open your order to read and reply: ${orderUrl}`,
    "",
    `Questions? Reach us at ${SUPPORT_EMAIL_FALLBACK}.`,
    "",
    `— The ${BRAND_NAME} team`,
  ].join("\n");

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#0f172a;line-height:1.6">
    <p style="font-size:16px;margin:0 0 12px">${hi}</p>
    <p style="font-size:16px;margin:0 0 20px">
      Your booster just sent you a message about
      <strong>order #${ref}</strong>. Open your order to read it and reply.
    </p>
    <p style="margin:0 0 28px">
      <a href="${orderUrl}"
         style="display:inline-block;background:#22c55e;color:#052e16;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;font-size:15px">
        View your order
      </a>
    </p>
    <p style="font-size:13px;color:#64748b;margin:0 0 4px">
      Or paste this link into your browser:<br/>
      <a href="${orderUrl}" style="color:#16a34a">${orderUrl}</a>
    </p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
    <p style="font-size:13px;color:#64748b;margin:0">
      Questions? Reach us at
      <a href="mailto:${SUPPORT_EMAIL_FALLBACK}" style="color:#16a34a">${SUPPORT_EMAIL_FALLBACK}</a>.<br/>
      — The ${BRAND_NAME} team
    </p>
  </div>`.trim();

  return {
    to: params.to,
    subject: `New message from your booster — order #${ref}`,
    html,
    text,
    replyTo: SUPPORT_EMAIL_FALLBACK,
  };
}
