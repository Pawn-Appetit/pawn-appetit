import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import i18n from "@/i18n";
import { pieceSetAtom, primaryColorAtom } from "@/state/atoms";
import { genID } from "@/utils/tabs";
import { builtInThemes, getBuiltInThemeById } from "../data/builtInThemes";
import type { Theme, ThemeExport, ThemeOperations } from "../types/theme";
import { themeSchema } from "../types/theme";

// Storage for custom themes
export const customThemesAtom = atomWithStorage<Theme[]>("custom-themes", []);

// Cleanup atom to remove duplicate theme IDs on initialization
export const cleanupDuplicateThemesAtom = atom(null, (get, set) => {
  const customThemes = get(customThemesAtom);
  const builtInThemeIds = new Set(builtInThemes.map((t) => t.id));

  // Remove custom themes that have the same ID as built-in themes
  // and remove duplicate custom themes (keep the first occurrence)
  const seenIds = new Set<string>();
  const cleanedThemes = customThemes.filter((theme) => {
    if (builtInThemeIds.has(theme.id)) {
      return false;
    }
    if (seenIds.has(theme.id)) {
      return false;
    }
    seenIds.add(theme.id);
    return true;
  });

  // Only update storage if duplicates were found
  if (cleanedThemes.length !== customThemes.length) {
    set(customThemesAtom, cleanedThemes);
  }
});

// Currently selected theme ID
export const currentThemeIdAtom = atomWithStorage<string>("current-theme-id", "default");

// Color scheme is separate from themes (light/dark/auto)
export const colorSchemeAtom = atomWithStorage<"light" | "dark" | "auto">("color-scheme", "auto");

// Computed atom for all themes (built-in + custom)
export const allThemesAtom = atom<Theme[]>((get) => {
  const customThemes = get(customThemesAtom);
  // Filter out custom themes that have the same ID as built-in themes
  // Built-in themes take precedence
  const uniqueCustomThemes = customThemes.filter(
    (customTheme) => !builtInThemes.some((builtInTheme) => builtInTheme.id === customTheme.id),
  );
  return [...builtInThemes, ...uniqueCustomThemes];
});

// Computed atom for current theme
export const currentThemeAtom = atom<Theme>((get) => {
  const currentThemeId = get(currentThemeIdAtom);
  const allThemes = get(allThemesAtom);
  const primaryColor = get(primaryColorAtom);

  const theme = allThemes.find((t) => t.id === currentThemeId) || builtInThemes[0];

  // Return theme with current primary color override if it exists
  return {
    ...theme,
    primaryColor: primaryColor || theme.primaryColor,
  };
});

// Initialize primary color from current theme on app start
export const initializeThemeAtom = atom(null, (get, set) => {
  // First, cleanup any duplicate themes
  const customThemes = get(customThemesAtom);
  const builtInThemeIds = new Set(builtInThemes.map((t) => t.id));
  const seenIds = new Set<string>();
  const cleanedThemes = customThemes.filter((theme) => {
    if (builtInThemeIds.has(theme.id) || seenIds.has(theme.id)) {
      return false;
    }
    seenIds.add(theme.id);
    return true;
  });
  if (cleanedThemes.length !== customThemes.length) {
    set(customThemesAtom, cleanedThemes);
  }

  // Then initialize the theme
  const currentThemeId = get(currentThemeIdAtom);
  const allThemes = get(allThemesAtom);
  const currentPrimaryColor = get(primaryColorAtom);

  const theme = allThemes.find((t) => t.id === currentThemeId) || builtInThemes[0];

  // If no primary color is set, use the theme's primary color
  if (!currentPrimaryColor) {
    set(primaryColorAtom, theme.primaryColor);
  }
});

// Theme operations
export const themeOperationsAtom = atom<ThemeOperations>((get) => ({
  create: (theme: Omit<Theme, "id" | "createdAt" | "updatedAt">) => {
    const newTheme: Theme = {
      ...theme,
      id: genID(),
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Validate theme
    const validated = themeSchema.parse(newTheme);
    return validated;
  },

  update: (id: string, updates: Partial<Theme>) => {
    const customThemes = get(customThemesAtom);
    const themeIndex = customThemes.findIndex((t) => t.id === id);

    if (themeIndex === -1) return null;

    const updatedTheme: Theme = {
      ...customThemes[themeIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    return themeSchema.parse(updatedTheme);
  },

  delete: (id: string) => {
    const customThemes = get(customThemesAtom);
    const builtInTheme = getBuiltInThemeById(id);

    // Cannot delete built-in themes
    if (builtInTheme) return false;

    const themeExists = customThemes.some((t) => t.id === id);
    return themeExists;
  },

  duplicate: (id: string, newName?: string) => {
    const allThemes = get(allThemesAtom);
    const originalTheme = allThemes.find((t) => t.id === id);

    if (!originalTheme) return null;

    const duplicatedTheme: Theme = {
      ...originalTheme,
      id: genID(),
      name: newName || `${originalTheme.name} Copy`,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return themeSchema.parse(duplicatedTheme);
  },

  export: (id: string) => {
    const allThemes = get(allThemesAtom);
    const theme = allThemes.find((t) => t.id === id);

    if (!theme) return null;

    // Remove internal fields for export
    const { id: _id, isBuiltIn: _isBuiltIn, createdAt: _createdAt, updatedAt: _updatedAt, ...exportData } = theme;
    return exportData as ThemeExport;
  },

  import: (themeData: ThemeExport) => {
    const newTheme: Theme = {
      ...themeData,
      id: genID(),
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return themeSchema.parse(newTheme);
  },

  getAll: () => {
    return get(allThemesAtom);
  },

  getById: (id: string) => {
    const allThemes = get(allThemesAtom);
    return allThemes.find((t) => t.id === id) || null;
  },

  getBuiltIn: () => {
    return builtInThemes;
  },

  getCustom: () => {
    return get(customThemesAtom);
  },
}));

// Write operations (these trigger state updates)
export const createThemeAtom = atom(null, (get, set, theme: Omit<Theme, "id" | "createdAt" | "updatedAt">) => {
  const operations = get(themeOperationsAtom);
  const newTheme = operations.create(theme);

  const customThemes = get(customThemesAtom);
  // Prevent adding a custom theme with an ID that already exists
  const existingTheme =
    customThemes.find((t) => t.id === newTheme.id) || builtInThemes.find((t) => t.id === newTheme.id);
  if (existingTheme) {
    throw new Error(`Theme with ID "${newTheme.id}" already exists`);
  }

  set(customThemesAtom, [...customThemes, newTheme]);

  return newTheme;
});

export const updateThemeAtom = atom(null, (get, set, { id, updates }: { id: string; updates: Partial<Theme> }) => {
  const operations = get(themeOperationsAtom);
  const updatedTheme = operations.update(id, updates);

  if (!updatedTheme) return null;

  const customThemes = get(customThemesAtom);
  const newCustomThemes = customThemes.map((t) => (t.id === id ? updatedTheme : t));

  set(customThemesAtom, newCustomThemes);
  return updatedTheme;
});

export const deleteThemeAtom = atom(null, (get, set, id: string) => {
  const operations = get(themeOperationsAtom);
  const canDelete = operations.delete(id);

  if (!canDelete) return false;

  const customThemes = get(customThemesAtom);
  const newCustomThemes = customThemes.filter((t) => t.id !== id);

  set(customThemesAtom, newCustomThemes);

  // If the deleted theme was active, switch to default
  const currentThemeId = get(currentThemeIdAtom);
  if (currentThemeId === id) {
    set(currentThemeIdAtom, "default");
  }

  return true;
});

export const duplicateThemeAtom = atom(null, (get, set, { id, newName }: { id: string; newName?: string }) => {
  const operations = get(themeOperationsAtom);
  const duplicatedTheme = operations.duplicate(id, newName);

  if (!duplicatedTheme) return null;

  const customThemes = get(customThemesAtom);
  // Prevent duplicating with an ID that already exists (should not happen with genID, but safety check)
  const existingTheme =
    customThemes.find((t) => t.id === duplicatedTheme.id) || builtInThemes.find((t) => t.id === duplicatedTheme.id);
  if (existingTheme) {
    throw new Error(`Theme with ID "${duplicatedTheme.id}" already exists`);
  }

  set(customThemesAtom, [...customThemes, duplicatedTheme]);

  return duplicatedTheme;
});

export const importThemeAtom = atom(null, (get, set, themeData: ThemeExport) => {
  const operations = get(themeOperationsAtom);
  const importedTheme = operations.import(themeData);

  const customThemes = get(customThemesAtom);
  // Prevent importing a theme with an ID that already exists
  const existingTheme =
    customThemes.find((t) => t.id === importedTheme.id) || builtInThemes.find((t) => t.id === importedTheme.id);
  if (existingTheme) {
    throw new Error(`Theme with ID "${importedTheme.id}" already exists`);
  }

  set(customThemesAtom, [...customThemes, importedTheme]);

  return importedTheme;
});

export const setCurrentThemeAtom = atom(null, (get, set, themeId: string) => {
  const operations = get(themeOperationsAtom);
  const theme = operations.getById(themeId);

  if (theme) {
    set(currentThemeIdAtom, themeId);
    // Update primary color to match the new theme
    set(primaryColorAtom, theme.primaryColor);

    // Academia Maya theme specific settings
    if (themeId === "academia-maya") {
      // Set pieces to merida
      set(pieceSetAtom, "merida");
    } else {
      set(pieceSetAtom, "staunty");
    }

    return theme;
  }

  return null;
});
