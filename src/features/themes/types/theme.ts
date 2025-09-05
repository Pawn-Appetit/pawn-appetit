import { z } from "zod";

// Theme Schema based on https://raw.githubusercontent.com/kahvilei/mantine-theme-generator/refs/heads/main/src/data/appTheme.json
export const themeColorsSchema = z.record(z.string(), z.array(z.string()).length(10));

export const themePrimaryShadeSchema = z.object({
  light: z.number().min(0).max(9),
  dark: z.number().min(0).max(9),
});

export const themeHeadingsSchema = z.object({
  fontFamily: z.string(),
  fontWeight: z.string(),
});

export const themeComponentStyleSchema = z.record(z.string(), z.any());

export const themeComponentSchema = z.object({
  defaultProps: z.record(z.string(), z.any()).optional(),
  styles: themeComponentStyleSchema.optional(),
});

export const themeComponentsSchema = z.record(z.string(), themeComponentSchema);

export const themeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  version: z.string().optional(),
  isBuiltIn: z.boolean().default(false),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),

  // Core theme properties
  scale: z.number().default(1),
  fontSmoothing: z.boolean().default(true),
  focusRing: z.enum(["auto", "always", "never"]).default("auto"),

  // Colors
  white: z.string().default("#ffffff"),
  black: z.string().default("#000000"),
  colors: themeColorsSchema,
  primaryShade: themePrimaryShadeSchema,
  primaryColor: z.string(),
  autoContrast: z.boolean().default(true),
  luminanceThreshold: z.number().default(0.3),

  // Typography
  fontFamily: z.string().default("system-ui, sans-serif"),
  fontFamilyMonospace: z.string().default("ui-monospace, monospace"),
  headings: themeHeadingsSchema.optional(),

  // Layout
  defaultRadius: z.enum(["xs", "sm", "md", "lg", "xl"]).default("md"),

  // Components
  components: themeComponentsSchema.optional(),
});

export type Theme = z.infer<typeof themeSchema>;
export type ThemeColors = z.infer<typeof themeColorsSchema>;
export type ThemePrimaryShade = z.infer<typeof themePrimaryShadeSchema>;
export type ThemeHeadings = z.infer<typeof themeHeadingsSchema>;
export type ThemeComponents = z.infer<typeof themeComponentsSchema>;

// Theme export/import format
export const themeExportSchema = themeSchema.omit({ id: true, isBuiltIn: true, createdAt: true, updatedAt: true });
export type ThemeExport = z.infer<typeof themeExportSchema>;

// Color scheme is separate from themes
export type ColorScheme = "light" | "dark" | "auto";

// Theme management operations
export interface ThemeOperations {
  create: (theme: Omit<Theme, "id" | "createdAt" | "updatedAt">) => Theme;
  update: (id: string, updates: Partial<Theme>) => Theme | null;
  delete: (id: string) => boolean;
  duplicate: (id: string, newName?: string) => Theme | null;
  export: (id: string) => ThemeExport | null;
  import: (themeData: ThemeExport) => Theme;
  getAll: () => Theme[];
  getById: (id: string) => Theme | null;
  getBuiltIn: () => Theme[];
  getCustom: () => Theme[];
}
