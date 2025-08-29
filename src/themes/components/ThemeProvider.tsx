import { DirectionProvider, MantineProvider, type MantineThemeOverride } from "@mantine/core";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { primaryColorAtom } from "@/state/atoms";
import { useTheme } from "../hooks";
import { convertToMantineTheme } from "../mantine-bridge";

interface ThemeProviderProps {
  children: ReactNode;
  mantineConfig?: Partial<MantineThemeOverride>;
  spellCheck?: boolean;
}

export function ThemeProvider({ children, mantineConfig, spellCheck }: ThemeProviderProps) {
  const { currentTheme } = useTheme();
  const [colorScheme, setColorScheme] = useState<"light" | "dark">("light");
  const primaryColor = useAtomValue(primaryColorAtom);

  useEffect(() => {
    if (currentTheme) {
      setColorScheme(currentTheme.type === "dark" ? "dark" : "light");
    }
  }, [currentTheme]);

  let finalTheme = mantineConfig;

  if (currentTheme) {
    try {
      const { components, ...themeFromCustom } = convertToMantineTheme(currentTheme, primaryColor, spellCheck);
      finalTheme = {
        ...themeFromCustom,
        ...mantineConfig,

        components: {
          ...components,
          ...mantineConfig?.components,
        },
      };
    } catch (error) {
      console.warn("Failed to convert custom theme to Mantine theme:", error);

      finalTheme = mantineConfig;
    }
  }

  return (
    <DirectionProvider>
      <MantineProvider theme={finalTheme} forceColorScheme={colorScheme}>
        {children}
      </MantineProvider>
    </DirectionProvider>
  );
}

export default ThemeProvider;
