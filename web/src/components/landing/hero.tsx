"use client";

import { ArrowRight, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import { buttonVariants } from "@/components/ui/button";
import { LiveFeed } from "./live-feed";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-hero">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60rem 30rem at 85% -10%, rgba(63,224,205,0.16), transparent 60%)",
        }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative mx-auto grid max-w-6xl gap-16 px-6 pt-16 pb-24 md:grid-cols-[1.05fr_0.95fr] md:items-center md:pt-24 md:pb-32">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.span
            variants={item}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs tracking-wide text-hero-ink-dim"
          >
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex size-1.5 rounded-full bg-signal" />
            </span>
            framework-agnostic · 6.8KB · zero dependencies
          </motion.span>

          <motion.h1
            variants={item}
            className="mt-6 text-4xl leading-[1.06] font-semibold tracking-tight text-hero-ink sm:text-5xl lg:text-6xl"
          >
            Errors, caught before the support ticket.
          </motion.h1>

          <motion.p variants={item} className="mt-6 max-w-lg text-lg text-hero-ink-dim">
            Mini Sentry watches the browser your users are actually in — JS
            exceptions, unhandled rejections, failed requests — and turns the
            noise into grouped, queryable errors the second they happen.
          </motion.p>

          <motion.div variants={item} className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="/register"
              className={buttonVariants({
                size: "lg",
                className: "bg-signal text-[#06201b] hover:bg-signal/90",
              })}
            >
              Get your API key
              <ArrowRight className="size-4" />
            </a>
            <a
              href="#docs"
              className={buttonVariants({
                size: "lg",
                variant: "outline",
                className:
                  "border-white/15 bg-transparent text-hero-ink hover:bg-white/10 hover:text-hero-ink",
              })}
            >
              <BookOpen className="size-4" />
              Read the SDK docs
            </a>
          </motion.div>
        </motion.div>

        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
        >
          <div className="overflow-hidden rounded-xl border border-white/10 bg-hero-panel shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="ml-3 flex items-center gap-1.5 font-mono text-xs text-hero-ink-dim">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-signal" />
                </span>
                live · project_a1b2
              </span>
            </div>
            <LiveFeed />
          </div>
          <p className="mt-3 text-center font-mono text-xs text-hero-ink-dim/60">
            a real project&rsquo;s error feed — grouped, not a wall of duplicates
          </p>
        </motion.div>
      </div>
    </section>
  );
}
