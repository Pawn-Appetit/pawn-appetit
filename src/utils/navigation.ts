import type { NavigateOptions } from "@tanstack/react-router";
import type { Tab } from "@/utils/tabs";

/**
 * Navigation utilities for conditional database modal flows
 */

export interface DatabaseNavigationOptions {
  /** The tab to open in the AddDatabase modal */
  tab?: "games" | "puzzles";
  /** URL to redirect to after modal submission */
  redirectTo?: string;
}

/**
 * Navigate to databases page with conditional modal opening
 *
 * @param navigate - TanStack Router navigate function
 * @param options - Navigation options for modal behavior
 * @returns NavigateOptions for TanStack Router
 */
export function navigateToDatabasesWithModal(
  navigate: (options: NavigateOptions) => void,
  options: DatabaseNavigationOptions = {},
): void {
  const { tab = "games", redirectTo } = options;

  const searchParams: Record<string, string> = {
    value: "add",
  };

  if (tab) {
    searchParams.tab = tab;
  }

  if (redirectTo) {
    searchParams.redirect = redirectTo;
  }

  navigate({
    to: "/databases",
    search: searchParams,
  });
}

/**
 * Navigate to puzzles page (boards with puzzle tab)
 * This creates a new puzzle tab in the boards interface
 *
 * @param navigate - TanStack Router navigate function
 * @param setTabs - Function to update tabs state
 * @param setActiveTab - Function to set active tab
 * @param tabName - Name for the puzzle tab
 */
export function navigateToPuzzles(
  navigate: (options: NavigateOptions) => void,
  setTabs: (updater: (prev: Tab[]) => Tab[]) => void,
  setActiveTab: (tabId: string) => void,
  tabName: string = "Puzzles",
): void {
  const uuid = generateId();

  setTabs((prev: Tab[]) => [
    ...prev,
    {
      value: uuid,
      name: tabName,
      type: "puzzles",
    },
  ]);

  setActiveTab(uuid);

  navigate({ to: "/boards" });
}

/**
 * Simple ID generator for tabs
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Get the current page path for redirect purposes
 */
export function getCurrentPath(): string {
  return window.location.pathname;
}

/**
 * Check if current location is puzzles page
 */
export function isPuzzlesPage(): boolean {
  return (
    (window.location.pathname === "/boards" && window.location.search.includes("puzzles")) ||
    document.title.toLowerCase().includes("puzzle")
  );
}

/**
 * Extract redirect URL from search parameters
 */
export function getRedirectFromSearch(searchParams: URLSearchParams): string | undefined {
  return searchParams.get("redirect") || undefined;
}
