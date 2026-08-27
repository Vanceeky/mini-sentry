import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { RevealGroup, RevealItem } from "./reveal";

export function Cta() {
  return (
    <section className="relative overflow-hidden bg-hero py-24">
      <div
        className="pointer-events-none absolute inset-0 animate-[pulse_6s_ease-in-out_infinite] motion-reduce:animate-none"
        style={{
          backgroundImage:
            "radial-gradient(40rem 20rem at 50% 0%, rgba(63,224,205,0.12), transparent 65%)",
        }}
      />
      <RevealGroup className="relative mx-auto max-w-2xl px-6 text-center">
        <RevealItem>
          <h2 className="text-3xl font-semibold text-hero-ink sm:text-4xl">
            Ready to see your first error?
          </h2>
        </RevealItem>
        <RevealItem>
          <p className="mt-4 text-hero-ink-dim">
            Create a project, get a key, and you&rsquo;re one{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em]">
              init()
            </code>{" "}
            away.
          </p>
        </RevealItem>
        <RevealItem className="mt-8 flex justify-center">
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
        </RevealItem>
      </RevealGroup>
    </section>
  );
}
