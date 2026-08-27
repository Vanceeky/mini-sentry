import { Layers3, Lock, Radar, Share2 } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RevealGroup, RevealItem } from "./reveal";

const FACTS = [
  { value: "6.8KB", label: "minified SDK bundle" },
  { value: "0", label: "runtime dependencies" },
  { value: "2", label: "install methods — npm or a script tag" },
];

const FEATURES = [
  {
    icon: Radar,
    title: "Automatic capture",
    body: "window error listeners, unhandled promise rejections, and a fetch wrapper that flags non-2xx responses and network failures — no try/catch scattered through your code.",
  },
  {
    icon: Layers3,
    title: "Grouped, not spammed",
    body: "Events fingerprint by type and message (endpoint + method for HTTP failures), so one real bug shows up as one group with an occurrence count — not a thousand identical rows.",
  },
  {
    icon: Lock,
    title: "Privacy by default",
    body: "Headers, bodies, cookies, and form values are never read. Any captured URL runs through credential-pattern redaction before it leaves the browser.",
  },
  {
    icon: Share2,
    title: "One API, every client",
    body: "The same query endpoints — list, detail, stats — back your web dashboard and your mobile app. No duplicated logic per platform.",
  },
];

export function Features() {
  return (
    <section id="features" className="bg-background py-24">
      <div className="mx-auto max-w-6xl px-6">
        <RevealGroup className="grid gap-x-8 gap-y-10 border-y border-border py-8 sm:grid-cols-3">
          {FACTS.map((f) => (
            <RevealItem key={f.label}>
              <p className="font-display text-3xl font-semibold text-foreground tabular-nums">
                {f.value}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{f.label}</p>
            </RevealItem>
          ))}
        </RevealGroup>

        <div className="mt-16 max-w-2xl">
          <span className="font-mono text-xs tracking-widest text-primary uppercase">
            What it does
          </span>
          <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">
            Built to be installed once and forgotten.
          </h2>
        </div>

        <RevealGroup className="mt-10 grid gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <RevealItem key={f.title}>
              <Card className="h-full border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5">
                <CardHeader>
                  <span className="flex size-9 items-center justify-center rounded-md bg-accent">
                    <f.icon className="size-4.5 text-accent-foreground" strokeWidth={2} />
                  </span>
                  <CardTitle className="mt-3 text-lg">{f.title}</CardTitle>
                  <CardDescription className="text-[0.92rem] leading-relaxed">
                    {f.body}
                  </CardDescription>
                </CardHeader>
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
