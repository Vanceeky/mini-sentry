import { Badge } from "@/components/ui/badge";
import type { ErrorType } from "@/lib/api";

const STYLE: Record<ErrorType, string> = {
  error: "border-[#e28579]/30 bg-[#e28579]/10 text-[#a23b3b]",
  http: "border-primary/30 bg-primary/10 text-primary",
  unhandledrejection: "border-[#c68fd8]/30 bg-[#c68fd8]/10 text-[#7a4a91]",
  resource: "border-[#c99a3a]/30 bg-[#c99a3a]/10 text-[#8a6d1b]",
};

export function TypeBadge({ type }: { type: ErrorType }) {
  return (
    <Badge variant="outline" className={`font-mono text-[0.68rem] ${STYLE[type]}`}>
      {type}
    </Badge>
  );
}
