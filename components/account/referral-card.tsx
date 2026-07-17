import { Gift } from "lucide-react";
import { CopyLinkButton } from "@/components/account/copy-link-button";
import { getSiteUrl } from "@/lib/config";
import { formatUsdFromCents } from "@/lib/money";
import { REFERRAL_REWARD_CENTS } from "@/lib/referrals/core";
import { countRewardedReferrals, getOrCreateShareCode } from "@/lib/referrals/service";

/**
 * "Refer a friend" card for the account page (async server component). Fetches
 * the signed-in user's share code (created on first view) and their rewarded
 * count through the service-role referral layer — participant RLS could read
 * these too, but the share row may not exist yet and creation is service-role
 * territory either way.
 *
 * Renders nothing when no code is available (zero-backend deploy or a
 * transient failure): a missing card beats a broken one, matching how other
 * surfaces degrade.
 */
export async function ReferralCard({ userId }: { userId: string }) {
  const code = await getOrCreateShareCode(userId);
  if (!code) return null;
  const rewardedCount = await countRewardedReferrals(userId);

  const shareUrl = `${getSiteUrl()}/sign-up?ref=${code}`;

  return (
    <section
      aria-labelledby="referral-heading"
      className="mt-8 rounded-xl border border-border bg-card/40 p-5"
    >
      <div className="flex items-center gap-2">
        <Gift className="size-4 text-accent" aria-hidden="true" />
        <h2 id="referral-heading" className="text-sm font-semibold">
          Refer a friend
        </h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Share your link and earn {formatUsdFromCents(REFERRAL_REWARD_CENTS)} store credit when they
        place their first paid order.
      </p>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Your referral link</p>
          <p className="truncate font-mono text-sm">{shareUrl}</p>
        </div>
        <CopyLinkButton value={shareUrl} label="referral link" />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Code <span className="font-mono">{code}</span>
        {rewardedCount > 0 && (
          <>
            {" "}
            · {rewardedCount} rewarded referral{rewardedCount === 1 ? "" : "s"} so far
          </>
        )}
      </p>
    </section>
  );
}
