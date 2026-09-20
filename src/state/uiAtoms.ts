/**
 * UI state atoms: tab management, per-tab panel state, and the `tabValue`
 * helper that maps a per-tab atom family to the currently active tab.
 */
import { atom, type PrimitiveAtom } from "jotai";
import { atomFamily, atomWithStorage, createJSONStorage } from "jotai/utils";
import type { AtomFamily } from "jotai/vanilla/utils/atomFamily";
import type { SetStateAction } from "react";
import type { LocalOptions } from "@/components/panels/database/DatabasePanel";
import { genID, type Tab, tabSchema } from "@/utils/tabs";
import { createZodStorage } from "./utils";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Tab management
// ---------------------------------------------------------------------------

export const tabsAtom = atomWithStorage<Tab[]>(
    "tabs",
    [],
    createZodStorage(z.array(tabSchema), sessionStorage),
);

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
        const nextValue =
            typeof newValue === "function" ? newValue(get(currentTabAtom)!) : newValue;
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
                const nextValue =
                    typeof newValue === "function"
                        ? newValue(get(tabValue(family)) as T)
                        : newValue;
                const a = family(newTab.value);
                set(a, nextValue);
                return;
            }

            const nextValue =
                typeof newValue === "function" ? newValue(get(tabValue(family)) as T) : newValue;
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

const LOCAL_OPTIONS_STORAGE_KEY = "database.local-options";

const LOCAL_OPTIONS_DEFAULTS: LocalOptions = {
    path: null,
    type: "exact",
    fen: "",
    forbidden_squares: [],
    player: null,
    color: "white",
    result: "any",
};

/**
 * The database filters are per-tab, but tabs do not survive an app restart, so
 * the last set of filters is also written to localStorage and used to seed any
 * tab created afterwards. Position-specific fields (fen/type) are refreshed
 * from the board by the panel for exact queries.
 */
function loadLastLocalOptions(): LocalOptions {
    try {
        const raw = localStorage.getItem(LOCAL_OPTIONS_STORAGE_KEY);
        if (!raw) return LOCAL_OPTIONS_DEFAULTS;
        return { ...LOCAL_OPTIONS_DEFAULTS, ...(JSON.parse(raw) as Partial<LocalOptions>) };
    } catch {
        return LOCAL_OPTIONS_DEFAULTS;
    }
}

function saveLastLocalOptions(options: LocalOptions): void {
    try {
        localStorage.setItem(LOCAL_OPTIONS_STORAGE_KEY, JSON.stringify(options));
    } catch {
        // Storage full or unavailable: filters stay session-only.
    }
}

const localOptionsFamily = atomFamily((tab: string) => {
    const base = atom<LocalOptions>(loadLastLocalOptions());
    return atom(
        (get) => get(base),
        (get, set, update: SetStateAction<LocalOptions>) => {
            const next = typeof update === "function" ? update(get(base)) : update;
            set(base, next);
            saveLastLocalOptions(next);
        },
    );
});
export const currentLocalOptionsAtom = tabValue(localOptionsFamily);

/**
 * Give a specific tab a starting search query.
 *
 * Options are per-tab, so a tab opened from search results would otherwise
 * begin with an empty exact search and lose the query that produced it.
 */
export const seedLocalOptionsAtom = atom(
    null,
    (_get, set, { tab, options }: { tab: string; options: LocalOptions }) => {
        set(localOptionsFamily(tab), options);
    },
);

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

export const sidebarCollapsedAtom = atomWithStorage("ui.sidebar.collapsed", true);
export const densityAtom = atomWithStorage<"comfortable" | "compact">("ui.density", "comfortable");
