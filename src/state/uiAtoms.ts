/**
 * UI state atoms: tab management, per-tab panel state, and the `tabValue`
 * helper that maps a per-tab atom family to the currently active tab.
 */
import { atom, type PrimitiveAtom } from "jotai";
import { atomFamily, atomWithStorage, createJSONStorage } from "jotai/utils";
import type { AtomFamily } from "jotai/vanilla/utils/atomFamily";
import type { LocalOptions } from "@/components/panels/database/DatabasePanel";
import { genID, type Tab, tabSchema } from "@/utils/tabs";
import { createZodStorage } from "./utils";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Tab management
// ---------------------------------------------------------------------------

export const tabsAtom = atomWithStorage<Tab[]>("tabs", [], createZodStorage(z.array(tabSchema), sessionStorage));

export const activeTabAtom = atomWithStorage<string | null>(
  "activeTab",
  "",
  createJSONStorage(() => sessionStorage),
);

export const currentTabAtom = atom(
  (get) => {
    const tabs = get(tabsAtom);
    const activeTab = get(activeTabAtom);
    return tabs.find((tab) => tab.value === activeTab);
  },
  (get, set, newValue: Tab | ((currentTab: Tab) => Tab)) => {
    const tabs = get(tabsAtom);
    const activeTab = get(activeTabAtom);
    const nextValue = typeof newValue === "function" ? newValue(get(currentTabAtom)!) : newValue;
    const newTabs = tabs.map((tab) => {
      if (tab.value === activeTab) {
        return nextValue;
      }
      return tab;
    });
    set(tabsAtom, newTabs);
  },
);

// ---------------------------------------------------------------------------
// tabValue — wraps a per-tab atomFamily into an atom scoped to the active tab
// ---------------------------------------------------------------------------

export function tabValue<T extends object | string | boolean | number | null | undefined>(
  family: AtomFamily<string, PrimitiveAtom<T>>,
) {
  return atom(
    (get) => {
      const tab = get(currentTabAtom);
      if (!tab) {
        const newTab: Tab = {
          name: "New Tab",
          value: genID(),
          type: "new",
        };
        const a = family(newTab.value);
        return get(a);
      }

      const a = family(tab.value);
      return get(a);
    },
    (get, set, newValue: T | ((currentValue: T) => T)) => {
      const tab = get(currentTabAtom);
      if (!tab) {
        const newTab: Tab = {
          name: "New Tab",
          value: genID(),
          type: "new",
        };
        const nextValue = typeof newValue === "function" ? newValue(get(tabValue(family)) as T) : newValue;
        const a = family(newTab.value);
        set(a, nextValue);
        return;
      }

      const nextValue = typeof newValue === "function" ? newValue(get(tabValue(family)) as T) : newValue;
      const a = family(tab.value);
      set(a, nextValue);
    },
  );
}

// ---------------------------------------------------------------------------
// Per-tab panel / display atoms
// ---------------------------------------------------------------------------

const threatFamily = atomFamily((tab: string) => atom(false));
export const currentThreatAtom = tabValue(threatFamily);

const evalOpenFamily = atomFamily((tab: string) => atom(true));
export const currentEvalOpenAtom = tabValue(evalOpenFamily);

const invisibleFamily = atomFamily((tab: string) => atom(false));
export const currentInvisibleAtom = tabValue(invisibleFamily);

const tabFamily = atomFamily((tab: string) => atom("info"));
export const currentTabSelectedAtom = tabValue(tabFamily);

const localOptionsFamily = atomFamily((tab: string) =>
  atom<LocalOptions>({
    path: null,
    type: "exact",
    fen: "",
    player: null,
    color: "white",
    result: "any",
  }),
);
export const currentLocalOptionsAtom = tabValue(localOptionsFamily);

const dbTypeFamily = atomFamily((tab: string) => atom<"local" | "lch_all" | "lch_master">("local"));
export const currentDbTypeAtom = tabValue(dbTypeFamily);

const dbTabFamily = atomFamily((tab: string) => atom("stats"));
export const currentDbTabAtom = tabValue(dbTabFamily);

const analysisTabFamily = atomFamily((tab: string) => atom("engines"));
export const currentAnalysisTabAtom = tabValue(analysisTabFamily);

const practiceTabFamily = atomFamily((tab: string) => atom("train"));
export const currentPracticeTabAtom = tabValue(practiceTabFamily);

const expandedEnginesFamily = atomFamily((tab: string) => atom<string[] | undefined>(undefined));
export const currentExpandedEnginesAtom = tabValue(expandedEnginesFamily);

const pgnOptionsFamily = atomFamily((tab: string) =>
  atom({
    comments: true,
    glyphs: true,
    variations: true,
    extraMarkups: true,
  }),
);
export const currentPgnOptionsAtom = tabValue(pgnOptionsFamily);
