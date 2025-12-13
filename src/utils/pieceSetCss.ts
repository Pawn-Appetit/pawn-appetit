const ACTIVE_LINK_ID = "piece-set-active-css";
const PRELOAD_LINK_ID = "piece-set-preload-css";

type ApplyOptions = {
  /**
   * If true, downloads the CSS but does NOT replace the active stylesheet.
   * Useful for warming cache without changing UI.
   */
  preloadOnly?: boolean;
  /**
   * Abort signal for callers that want to cancel in-flight loads.
   */
  signal?: AbortSignal;
};

const inflight = new Map<string, Promise<void>>();

function pieceSetHref(pieceSet: string) {
  return `/pieces/${pieceSet}.css`;
}

function removeLinkById(id: string) {
  const el = document.getElementById(id);
  if (el && el.tagName.toLowerCase() === "link") {
    el.parentElement?.removeChild(el);
  }
}

function getActiveHref(): string | null {
  const el = document.getElementById(ACTIVE_LINK_ID) as HTMLLinkElement | null;
  return el?.href ?? null;
}

/**
 * Ensures the requested piece-set stylesheet is downloaded, and optionally applied.
 *
 * Key properties:
 * - Keeps at most 2 link tags (active + preload) to avoid accumulating huge stylesheets.
 * - Never treats an existing link as "loaded" unless it has actually finished loading.
 * - On error, cleans up the broken link so we can retry later.
 */
export function ensurePieceSetCss(pieceSet: string, options: ApplyOptions = {}): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (!pieceSet) return Promise.resolve();

  const href = pieceSetHref(pieceSet);
  const key = `${pieceSet}:${options.preloadOnly ? "preload" : "apply"}`;

  if (inflight.has(key)) return inflight.get(key)!;

  const promise = new Promise<void>((resolve, reject) => {
    const { signal, preloadOnly } = options;

    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    // If it's already active and caller wants it applied, we are done.
    if (!preloadOnly) {
      const activeHref = getActiveHref();
      if (activeHref && activeHref.endsWith(href)) {
        resolve();
        return;
      }
    }

    // Remove any previous preload link (stale / failed / in progress).
    removeLinkById(PRELOAD_LINK_ID);

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.id = PRELOAD_LINK_ID;

    // Load without applying to avoid a full style recalculation while downloading.
    // NOTE: parsing still happens, but this avoids applying rules until ready.
    link.media = preloadOnly ? "print" : "print";

    const cleanup = () => {
      link.onload = null;
      link.onerror = null;
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      // Remove the partially loaded link so future calls can retry cleanly.
      removeLinkById(PRELOAD_LINK_ID);
      reject(new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    link.onload = () => {
      cleanup();

      // Warm-cache mode: keep it non-applying and remove it (we only wanted the download).
      if (preloadOnly) {
        // Give the browser a tick to register the sheet, then remove.
        requestAnimationFrame(() => {
          removeLinkById(PRELOAD_LINK_ID);
          resolve();
        });
        return;
      }

      // Apply atomically: keep old active stylesheet until new one is ready, then swap.
      link.media = "all";

      // Replace active link (if any) after the new one is applied.
      requestAnimationFrame(() => {
        removeLinkById(ACTIVE_LINK_ID);
        link.id = ACTIVE_LINK_ID;
        resolve();
      });
    };

    link.onerror = () => {
      cleanup();
      // Clean up so we don't get stuck with a broken/preload-only link.
      removeLinkById(PRELOAD_LINK_ID);
      reject(new Error(`Failed to load piece set CSS: ${pieceSet}`));
    };

    document.head.appendChild(link);
  }).finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}


