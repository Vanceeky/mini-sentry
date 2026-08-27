"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export type CodeLang = "ts" | "bash" | "json" | "html" | "text";

function highlight(code: string, lang: CodeLang) {
  const esc = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  if (lang === "json") {
    return esc.replace(
      /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+\.?\d*\b)/g,
      (match, str, colon, kw, num) => {
        if (str) {
          const cls = colon ? "text-[#7fd0c9]" : "text-[#d9b26a]";
          return `<span class="${cls}">${str}</span>${colon ?? ""}`;
        }
        if (kw) return `<span class="text-[#c68fd8]">${kw}</span>`;
        if (num) return `<span class="text-[#8fb8e0]">${num}</span>`;
        return match;
      },
    );
  }

  if (lang === "bash") {
    return esc
      .replace(/^(#.*)$/gm, '<span class="text-[#6b7c80] italic">$1</span>')
      .replace(/(--?[a-zA-Z-]+)/g, '<span class="text-[#8fb8e0]">$1</span>')
      .replace(/(&quot;[^&]*?&quot;|'[^']*?')/g, '<span class="text-[#d9b26a]">$1</span>');
  }

  if (lang === "ts") {
    return esc
      .replace(
        /\b(import|from|export|function|const|let|return|if|new)\b/g,
        '<span class="text-[#c68fd8]">$1</span>',
      )
      .replace(/(&quot;[^&]*?&quot;|'[^']*?')/g, '<span class="text-[#d9b26a]">$1</span>')
      .replace(/(\/\/.*)$/gm, '<span class="text-[#6b7c80] italic">$1</span>');
  }

  if (lang === "html") {
    return esc
      .replace(/(&lt;\/?[a-zA-Z0-9-]+)/g, '<span class="text-[#c68fd8]">$1</span>')
      .replace(/([a-zA-Z-]+)(=)(&quot;[^&]*?&quot;)/g, '<span class="text-[#8fb8e0]">$1</span>$2<span class="text-[#d9b26a]">$3</span>');
  }

  return esc;
}

export function CodeBlock({
  code,
  lang,
  label,
}: {
  code: string;
  lang: CodeLang;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard unavailable — no-op, button just won't confirm
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#0b1113]">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-1.5">
        <span className="font-mono text-[0.68rem] tracking-wider text-white/50 uppercase">
          {label ?? lang}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 font-mono text-[0.68rem] tracking-wide text-white/70 uppercase transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 text-[0.83rem] leading-relaxed">
        <code
          className="font-mono text-[#dce6e2]"
          dangerouslySetInnerHTML={{ __html: highlight(code, lang) }}
        />
      </pre>
    </div>
  );
}
