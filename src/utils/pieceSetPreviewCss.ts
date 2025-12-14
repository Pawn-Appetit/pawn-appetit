const PREVIEW_STYLE_ID = "piece-set-preview-style";
const DEFAULT_SCOPE_SELECTOR = "#piece-preview-container";

const processedCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function pieceSetHref(pieceSet: string) {
  return `/pieces/${pieceSet}.css`;
}

function getStyleEl(): HTMLStyleElement {
  let el = document.getElementById(PREVIEW_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = PREVIEW_STYLE_ID;
    document.head.appendChild(el);
  }
  return el;
}

export function clearPieceSetPreviewCss() {
  if (typeof document === "undefined") return;
  const el = document.getElementById(PREVIEW_STYLE_ID);
  el?.parentElement?.removeChild(el);
}

/**
 * Prefixes every non-@ selector with the given scope selector.
 * These piece-set css files are simple rule lists; we keep parsing lightweight and cached.
 */
function scopeCss(cssText: string, scopeSelector: string): string {
  // Normalize newlines to make parsing predictable.
  const css = cssText.replace(/\r\n/g, "\n");
  let out = "";
  let last = 0;

  // We transform each "selector { ... }" where selector does not start with "@"
  // This intentionally ignores complex cases (nested blocks) but works for our piece CSS.
  for (let i = 0; i < css.length; i++) {
    if (css[i] !== "{") continue;

    // Find selector start: after last "}" (or start of file).
    const selectorStart = css.lastIndexOf("}", i - 1) + 1;
    const selectorRaw = css.slice(selectorStart, i).trim();

    // Append untouched chunk before selector.
    out += css.slice(last, selectorStart);

    if (selectorRaw.startsWith("@")) {
      // Keep at-rules as-is.
      out += css.slice(selectorStart, i);
    } else {
      const scopedSelector = selectorRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => `${scopeSelector} ${s}`)
        .join(", ");
      out += `${scopedSelector} `;
    }

    // Continue from the "{"
    last = i;
  }

  out += css.slice(last);
  return out;
}

async function fetchAndProcess(pieceSet: string, scopeSelector: string, signal?: AbortSignal): Promise<string> {
  const cacheKey = `${pieceSet}::${scopeSelector}`;
  if (processedCache.has(cacheKey)) return processedCache.get(cacheKey)!;
  if (inflight.has(cacheKey)) return inflight.get(cacheKey)!;

  const promise = (async () => {
    const res = await fetch(pieceSetHref(pieceSet), { signal, cache: "force-cache" });
    if (!res.ok) throw new Error(`Failed to fetch piece set CSS: ${pieceSet}`);
    const cssText = await res.text();
    const processed = scopeCss(cssText, scopeSelector);
    processedCache.set(cacheKey, processed);
    return processed;
  })().finally(() => {
    inflight.delete(cacheKey);
  });

  inflight.set(cacheKey, promise);
  return promise;
}

/**
 * Applies a scoped (preview-only) version of the piece-set stylesheet.
 * This does NOT change the board; it only affects elements inside the scope selector.
 */
export async function applyPieceSetPreviewCss(
  pieceSet: string,
  options: { scopeSelector?: string; signal?: AbortSignal } = {},
): Promise<void> {
  if (typeof document === "undefined") return;
  if (!pieceSet) return;

  const scopeSelector = options.scopeSelector ?? DEFAULT_SCOPE_SELECTOR;
  const css = await fetchAndProcess(pieceSet, scopeSelector, options.signal);
  const styleEl = getStyleEl();
  styleEl.textContent = css;
}
