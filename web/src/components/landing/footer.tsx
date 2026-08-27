import { ShieldHalf } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-hero py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <a href="#top" className="flex items-center gap-2 text-hero-ink-dim">
          <ShieldHalf className="size-4" />
          <span className="font-mono text-xs">Mini Sentry</span>
        </a>
        <p className="font-mono text-xs text-hero-ink-dim/70">
          client-side error monitoring · REST API v1
        </p>
        <a
          href="https://github.com/Vanceeky/mini-sentry"
          className="font-mono text-xs text-hero-ink-dim hover:text-hero-ink"
        >
          github
        </a>
      </div>
    </footer>
  );
}
