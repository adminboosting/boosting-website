import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { setPricingReviewed } from "@/app/(admin)/admin/settings/actions";
import { SettingForm } from "@/app/(admin)/admin/settings/setting-form";
import { AdminActionButton } from "@/components/admin/admin-action-button";
import { requireAdmin } from "@/lib/auth/session";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Admin — settings",
  description: "Site settings: pricing review gate and runtime configuration.",
  robots: { index: false },
};

interface SettingRow {
  key: string;
  value: unknown;
  updated_at: string;
}

/** Editor copy per key; pricing_reviewed is excluded (it gets the toggle). */
const EDITABLE_SETTINGS: ReadonlyArray<{
  key: string;
  description: string;
  multiline: boolean;
}> = [
  { key: "brand_name", description: "Display name used across the site.", multiline: false },
  {
    key: "support_email",
    description: "Support address shown to customers.",
    multiline: false,
  },
  {
    key: "pricing_placeholder_note",
    description: "Internal reminder shown while pricing is unreviewed.",
    multiline: false,
  },
  {
    key: "pricing_settings",
    description:
      "Pricing engine knobs (JSON): duo multiplier, booster cut, volume discounts, discount cap, LoL LP rules. Saving refreshes the public pricing pages immediately.",
    multiline: true,
  },
];

/** jsonb → editor text: strings raw, everything else pretty JSON. */
function serializeValue(key: string, value: unknown): string {
  if (key === "pricing_settings") return JSON.stringify(value ?? {}, null, 2);
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

export default async function AdminSettingsPage() {
  // Independent identity check on top of the layout's — layers hold alone.
  await requireAdmin();

  // Reads are USER-scoped (site_settings grants SELECT to everyone); only the
  // WRITES need the service role — the grant trap documented in actions.ts.
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_settings")
    .select("key, value, updated_at")
    .order("key", { ascending: true });
  const settings = (data ?? []) as SettingRow[];
  const byKey = new Map(settings.map((row) => [row.key, row]));

  const pricingReviewed = byKey.get("pricing_reviewed")?.value === true;
  const serviceRoleReady = isServiceRoleConfigured();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Runtime configuration stored in <code>site_settings</code>. Pricing changes revalidate the
        public game pages immediately.
      </p>

      {!serviceRoleReady && (
        <div className="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-5 text-sm">
          Settings are read-only on this deployment — <code>SUPABASE_SERVICE_ROLE_KEY</code> is
          missing (see RUNBOOK.md).
        </div>
      )}

      {/* The launch gate, front and center: every price in the catalog is a
          PLACEHOLDER until the owner has walked the numbers. */}
      <section
        className={
          pricingReviewed
            ? "mt-6 rounded-xl border border-success/40 bg-success/10 p-5"
            : "mt-6 rounded-xl border border-warning/40 bg-warning/10 p-5"
        }
      >
        <div className="flex items-start gap-3">
          {pricingReviewed ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          )}
          <div className="flex-1">
            <h2 className="font-semibold">Pricing review</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {pricingReviewed
                ? "Pricing has been marked reviewed. Flip it back if you change the catalog and need another pass."
                : "Prices are still catalog defaults — review every game's numbers before launch. This flag is your go/no-go gate."}
            </p>
            <div className="mt-3">
              <AdminActionButton
                action={setPricingReviewed.bind(null, !pricingReviewed)}
                label={pricingReviewed ? "Mark as needs review" : "Mark pricing reviewed"}
                variant={pricingReviewed ? "outline" : "default"}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Configuration</h2>
        {EDITABLE_SETTINGS.map((setting) => (
          <SettingForm
            key={setting.key}
            settingKey={setting.key}
            description={setting.description}
            initialValue={serializeValue(setting.key, byKey.get(setting.key)?.value)}
            multiline={setting.multiline}
          />
        ))}
      </section>
    </div>
  );
}
