import { AlertTriangle } from "lucide-react";

export interface LegalSection {
  heading: string;
  body: string[];
}

export function LegalShell({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">PLACEHOLDER — not legal advice.</span>{" "}
          This is a draft reflecting common market norms and must be reviewed by a qualified lawyer
          before launch.
        </p>
      </div>

      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>
      <p className="mt-6 leading-relaxed text-muted-foreground">{intro}</p>

      <div className="mt-8 space-y-8">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            {section.body.map((para, i) => (
              <p key={i} className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {para}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
