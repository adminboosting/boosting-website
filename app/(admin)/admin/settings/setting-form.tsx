"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { saveSiteSetting, type SettingFormState } from "@/app/(admin)/admin/settings/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const INITIAL_STATE: SettingFormState = { ok: false, error: null };

/**
 * One site_settings key as an inline editor. Presentation only — the action
 * re-verifies the admin role, validates per-key with siteSettingSchema, and
 * writes through the service role (the authenticated grant is SELECT-only;
 * see settings/actions.ts).
 */
export function SettingForm({
  settingKey,
  description,
  initialValue,
  multiline = false,
}: {
  settingKey: string;
  description: string;
  initialValue: string;
  multiline?: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveSiteSetting, INITIAL_STATE);

  const inputClassName = cn(
    "mt-2 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    multiline && "font-mono text-xs",
  );

  return (
    <form action={formAction} className="rounded-xl border border-border bg-card/40 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-mono text-sm font-semibold">{settingKey}</h3>
        {state.ok && !pending && (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="size-3.5" />
            Saved
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>

      <input type="hidden" name="key" value={settingKey} />
      {multiline ? (
        <textarea
          name="value"
          rows={8}
          defaultValue={initialValue}
          spellCheck={false}
          aria-label={`Value for ${settingKey}`}
          className={inputClassName}
        />
      ) : (
        <input
          name="value"
          type="text"
          defaultValue={initialValue}
          autoComplete="off"
          aria-label={`Value for ${settingKey}`}
          className={cn(inputClassName, "h-9 py-0")}
        />
      )}

      {state.error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="mt-3">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  );
}
