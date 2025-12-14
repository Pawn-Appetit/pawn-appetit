import { IS_DEV } from "@/config";

export function devLog(...args: unknown[]) {
  if (!IS_DEV) return;
  // biome-ignore lint/suspicious/noConsoleLog: intentional dev-only logging
  console.log(...args);
}

export function devWarn(...args: unknown[]) {
  if (!IS_DEV) return;
  // biome-ignore lint/suspicious/noConsoleLog: intentional dev-only logging
  console.warn(...args);
}
