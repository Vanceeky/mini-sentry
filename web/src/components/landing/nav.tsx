"use client";

import { Menu, ShieldHalf } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const LINKS = [
  { href: "#features", label: "Product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#docs", label: "Docs" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a1210]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <a href="#top" className="flex items-center gap-2 text-hero-ink">
          <span className="flex size-7 items-center justify-center rounded-md border border-signal/30 bg-signal/10">
            <ShieldHalf className="size-4 text-signal" strokeWidth={2} />
          </span>
          <span className="font-display text-[1.05rem] font-semibold tracking-tight">
            Mini Sentry
          </span>
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="group relative text-sm text-hero-ink-dim transition-colors hover:text-hero-ink"
            >
              {l.label}
              <span className="absolute inset-x-0 -bottom-1 h-px origin-left scale-x-0 bg-signal transition-transform duration-200 group-hover:scale-x-100" />
            </a>
          ))}
          <a
            href="https://github.com/Vanceeky/mini-sentry"
            className="text-sm text-hero-ink-dim transition-colors hover:text-hero-ink"
          >
            GitHub
          </a>
        </nav>

        <div className="hidden md:block">
          <a
            href="/register"
            className={buttonVariants({ className: "bg-signal text-[#06201b] hover:bg-signal/90" })}
          >
            Get your API key
          </a>
        </div>

        <Sheet>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="text-hero-ink hover:bg-white/10 hover:text-hero-ink md:hidden"
              />
            }
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent
            side="right"
            className="border-white/10 bg-[#0a1210] text-hero-ink"
          >
            <SheetHeader>
              <SheetTitle className="font-display text-hero-ink">
                Mini Sentry
              </SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-4">
              {LINKS.map((l) => (
                <a key={l.href} href={l.href} className="text-hero-ink-dim hover:text-hero-ink">
                  {l.label}
                </a>
              ))}
              <a
                href="https://github.com/Vanceeky/mini-sentry"
                className="text-hero-ink-dim hover:text-hero-ink"
              >
                GitHub
              </a>
              <a
                href="/register"
                className={buttonVariants({
                  className: "mt-2 bg-signal text-[#06201b] hover:bg-signal/90",
                })}
              >
                Get your API key
              </a>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
