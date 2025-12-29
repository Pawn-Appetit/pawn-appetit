import { logger } from "@/utils/logger";

const tabStateMemory = new Map<string, string>();

function isQuotaError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name) : "";
  if (name === "QuotaExceededError") return true;
  const message = "message" in error ? String((error as { message?: unknown }).message) : "";
  return message.toLowerCase().includes("quota");
}

export function setTabState(tabId: string, value: string): boolean {
  try {
    sessionStorage.setItem(tabId, value);
    tabStateMemory.delete(tabId);
    return true;
  } catch (error) {
    if (isQuotaError(error)) {
      tabStateMemory.set(tabId, value);
      logger.warn("Tab state stored in memory due to sessionStorage quota", { tabId });
      return false;
    }
    logger.warn("Tab state storage failed", { tabId, error });
    return false;
  }
}

export function getTabState(tabId: string): string | null {
  try {
    const value = sessionStorage.getItem(tabId);
    if (value !== null) return value;
  } catch {
    // Ignore sessionStorage read errors and fall back to memory.
  }
  return tabStateMemory.get(tabId) ?? null;
}

export function removeTabState(tabId: string) {
  try {
    sessionStorage.removeItem(tabId);
  } catch {
    // Ignore sessionStorage remove errors.
  }
  tabStateMemory.delete(tabId);
}

export const tabStateStorage = {
  getItem: (key: string) => getTabState(key),
  setItem: (key: string, value: string) => {
    setTabState(key, value);
  },
  removeItem: (key: string) => {
    removeTabState(key);
  },
} as Storage;
