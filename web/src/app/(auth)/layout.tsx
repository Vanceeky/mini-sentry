import { ShieldHalf } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16">
      <a href="/" className="mb-8 flex items-center gap-2 text-foreground">
        <span className="flex size-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
          <ShieldHalf className="size-4.5 text-primary" strokeWidth={2} />
        </span>
        <span className="font-display text-lg font-semibold tracking-tight">
          Mini Sentry
        </span>
      </a>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
