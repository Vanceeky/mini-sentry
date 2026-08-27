import { RevealGroup, RevealItem } from "./reveal";

const STEPS = [
  {
    n: "01",
    title: "Create a project",
    body: "Register, log in, and create a project. The API key is shown exactly once — save it.",
  },
  {
    n: "02",
    title: "Install the SDK",
    body: "npm install @mini-sentry/sdk, or drop in the script-tag bundle. Either way, one init() call.",
  },
  {
    n: "03",
    title: "Errors get grouped",
    body: "Every captured event is fingerprinted and persisted — a repeat occurrence increments a counter, it doesn't create noise.",
  },
  {
    n: "04",
    title: "Query from anywhere",
    body: "Pull errors, occurrences, and stats from the same REST endpoints — dashboard, mobile, or a script of your own.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border bg-secondary/40 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <span className="font-mono text-xs tracking-widest text-primary uppercase">
          Setup
        </span>
        <h2 className="mt-3 max-w-xl text-3xl font-semibold text-foreground sm:text-4xl">
          Four steps, in order, once.
        </h2>

        <RevealGroup className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <RevealItem key={s.n} className="relative pl-1">
              <span className="font-display text-4xl font-semibold text-primary/25 tabular-nums">
                {s.n}
              </span>
              <h3 className="mt-3 text-base font-semibold text-foreground">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {s.body}
              </p>
              {i < STEPS.length - 1 && (
                <span className="absolute top-4 -right-3 hidden h-px w-6 bg-border lg:block" />
              )}
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
