export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);

  if (abs < 60) return "just now";
  if (abs < 60 * 60) return `${Math.round(abs / 60)}m ago`;
  if (abs < 60 * 60 * 24) return `${Math.round(abs / 3600)}h ago`;
  if (abs < 60 * 60 * 24 * 7) return `${Math.round(abs / 86400)}d ago`;

  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
