"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const POOL = [
  { type: "error", msg: "TypeError: Failed to fetch", meta: "app.js:42 · loadUser" },
  { type: "http", msg: "HTTP 500 GET /api/users", meta: "3 occurrences · grouped" },
  { type: "rejection", msg: "unhandledrejection: Network request failed", meta: "checkout.js:118" },
  { type: "http", msg: "HTTP 429 POST /api/orders", meta: "1st occurrence" },
  { type: "error", msg: "ReferenceError: cart is not defined", meta: "cart.js:9" },
  { type: "http", msg: "HTTP 503 GET /api/inventory", meta: "2nd occurrence · grouped" },
] as const;

const TYPE_STYLE: Record<string, string> = {
  error: "text-[#e28579] border-[#e28579]/30 bg-[#e28579]/10",
  http: "text-signal border-signal/30 bg-signal/10",
  rejection: "text-[#c68fd8] border-[#c68fd8]/30 bg-[#c68fd8]/10",
};

function timeNow() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

export function LiveFeed() {
  const cursor = useRef(4);
  const [events, setEvents] = useState(() =>
    POOL.slice(0, 4).map((e, i) => ({ ...e, id: i, t: timeNow() })),
  );

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const id = setInterval(() => {
      const next = POOL[cursor.current % POOL.length];
      cursor.current += 1;
      setEvents((prev) =>
        [{ ...next, id: cursor.current, t: timeNow() }, ...prev].slice(0, 4),
      );
    }, 3200);

    return () => clearInterval(id);
  }, []);

  return (
    <ul className="divide-y divide-white/[0.06]">
      <AnimatePresence initial={false} mode="popLayout">
        {events.map((e) => (
          <motion.li
            key={e.id}
            layout
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex items-start gap-3 px-4 py-3.5"
          >
            <span className="mt-0.5 shrink-0 font-mono text-[0.72rem] text-hero-ink-dim/70 tabular-nums">
              {e.t}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[0.62rem] tracking-wide uppercase ${TYPE_STYLE[e.type]}`}
                >
                  {e.type}
                </span>
                <span className="truncate font-mono text-[0.82rem] text-hero-ink">
                  {e.msg}
                </span>
              </div>
              <p className="mt-1 font-mono text-[0.7rem] text-hero-ink-dim/70">{e.meta}</p>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
