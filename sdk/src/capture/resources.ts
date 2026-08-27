import { captureEnvironment } from "../context/environment";
import { generateId } from "../core/id";
import { safeExec, warn } from "../core/safe";
import { scrubUrl } from "../core/scrub";
import type { CapturedEvent } from "./types";

export type ResourceCaptureHandler = (event: CapturedEvent) => void;

let installed = false;

const RESOURCE_TAG_NAMES = ["img", "script", "link"] as const;
type ResourceTagName = (typeof RESOURCE_TAG_NAMES)[number];

function isResourceTagName(tagName: string): tagName is ResourceTagName {
  return (RESOURCE_TAG_NAMES as readonly string[]).includes(tagName);
}

function resolveResourceUrl(element: Element): string | undefined {
  const src = (element as HTMLImageElement | HTMLScriptElement).src;
  if (src) return src;
  return (element as HTMLLinkElement).href;
}

/**
 * The DOM's resource-load error event never exposes an HTTP status code —
 * that's a deliberate browser restriction, not something missed. The
 * Resource Timing API is the one legitimate way to recover it without
 * making a second request: responseStatus is 0 ("not available") for
 * cross-origin resources unless the server opts in via a
 * Timing-Allow-Origin header, and unsupported in some older browsers — so
 * this is inherently best-effort, and deliberately never guessed/faked.
 */
function resolveResourceStatusCode(url: string): number | undefined {
  try {
    if (typeof performance?.getEntriesByName !== "function") return undefined;
    const entries = performance.getEntriesByName(url, "resource") as PerformanceResourceTiming[];
    const status = entries[entries.length - 1]?.responseStatus;
    return typeof status === "number" && status >= 100 && status <= 599 ? status : undefined;
  } catch {
    return undefined;
  }
}

function buildEvent(tagName: ResourceTagName, url: string, statusCode: number | undefined): CapturedEvent {
  return {
    id: generateId(),
    type: "resource",
    message: `Failed to load resource: ${tagName}`,
    timestamp: new Date().toISOString(),
    resource: { url, tagName, statusCode },
    ...captureEnvironment(),
  };
}

/**
 * Listens for element-level resource load failures (broken <img>/<script
 * src>/<link href>) — these are browser-native resource fetches, not JS
 * fetch() calls, so installFetchInterceptor() never sees them. Resource
 * load errors don't bubble, so this must listen in the capture phase;
 * document (rather than window) is the listen target so a plain
 * window-targeted script-error ErrorEvent is never mistaken for one — it's
 * filtered out below by requiring event.target to be an Element.
 *
 * Deliberately scoped to img/script/link only, not every possible resource
 * (audio/video/iframe, CSS-loaded backgrounds) — see sdk/README.md.
 */
export function installResourceErrorListener(onCapture: ResourceCaptureHandler): void {
  if (installed) return;

  if (typeof document === "undefined") {
    warn("no document object available; skipping resource error listener setup.");
    return;
  }

  document.addEventListener(
    "error",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const tagName = target.tagName.toLowerCase();
      if (!isResourceTagName(tagName)) return;

      const url = resolveResourceUrl(target);
      if (!url) return;

      // Status lookup uses the raw url — it must match the browser's own
      // Resource Timing entry name, which scrubUrl()'s redaction would break.
      const statusCode = resolveResourceStatusCode(url);

      safeExec(
        () => onCapture(buildEvent(tagName, scrubUrl(url), statusCode)),
        "failed to handle a captured resource load failure",
      );
    },
    true, // capture phase — resource-load errors don't bubble
  );

  installed = true;
}
