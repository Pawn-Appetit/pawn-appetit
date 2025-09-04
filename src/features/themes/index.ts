// Theme management exports

export { default as ColorSchemeSettings } from "./components/ColorSchemeSettings";
export { default as ComponentThemeEditor } from "./components/ComponentThemeEditor";
export { default as ThemeManager } from "./components/ThemeManager";
export { default as ThemePreview } from "./components/ThemePreview";
export { default as ThemeProvider } from "./components/ThemeProvider";
export { default as ThemeSettings } from "./components/ThemeSettings";
export { default as VisualThemeEditor } from "./components/VisualThemeEditor";
// Built-in themes
export {
  builtInThemes,
  defaultTheme,
  getBuiltInThemeById,
  getBuiltInThemes,
  githubTheme,
  materialTheme,
} from "./data/builtInThemes";

// State management
export {
  allThemesAtom,
  colorSchemeAtom,
  createThemeAtom,
  currentThemeAtom,
  currentThemeIdAtom,
  customThemesAtom,
  deleteThemeAtom,
  duplicateThemeAtom,
  importThemeAtom,
  setCurrentThemeAtom,
  themeOperationsAtom,
  updateThemeAtom,
} from "./state/themeAtoms";
// Types
export type {
  ColorScheme,
  Theme,
  ThemeColors,
  ThemeComponents,
  ThemeExport,
  ThemeHeadings,
  ThemeOperations,
  ThemePrimaryShade,
} from "./types/theme";

// Schema validation
export {
  themeColorsSchema,
  themeComponentsSchema,
  themeExportSchema,
  themeHeadingsSchema,
  themePrimaryShadeSchema,
  themeSchema,
} from "./types/theme";

// Utilities
export {
  darken,
  generateColorShades,
  generateHarmoniousColors,
  getAccessibleTextColor,
  getContrastRatio,
  getLuminance,
  hexToHsl,
  hexToRgb,
  hslToHex,
  isAccessible,
  lighten,
} from "./utils/colorUtils";
