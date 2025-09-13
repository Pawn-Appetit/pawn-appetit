import {
  ActionIcon,
  Autocomplete,
  createTheme,
  DirectionProvider,
  type MantineColorShade,
  type MantineColorsTuple,
  MantineProvider,
  Textarea,
  TextInput,
  useMantineColorScheme,
} from "@mantine/core";
import { useAtom, useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { spellCheckAtom } from "@/state/atoms";
import { colorSchemeAtom, currentThemeAtom, initializeThemeAtom } from "../state/themeAtoms";

interface ThemeProviderProps {
  children: ReactNode;
}

interface ColorSchemeSyncProps {
  children: ReactNode;
}

function ColorSchemeSync({ children }: ColorSchemeSyncProps) {
  const colorScheme = useAtomValue(colorSchemeAtom);
  const { setColorScheme } = useMantineColorScheme();

  useEffect(() => {
    setColorScheme(colorScheme);
  }, [colorScheme, setColorScheme]);

  return <>{children}</>;
}

function ThemeProvider({ children }: ThemeProviderProps) {
  const spellCheck = useAtomValue(spellCheckAtom);
  const currentTheme = useAtomValue(currentThemeAtom);
  const colorScheme = useAtomValue(colorSchemeAtom);
  const [, initializeTheme] = useAtom(initializeThemeAtom);

  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  const config = {
    scale: currentTheme.scale,
    fontSmoothing: currentTheme.fontSmoothing,
    focusRing: currentTheme.focusRing,
    white: currentTheme.white,
    black: currentTheme.black,
    colors: currentTheme.colors as unknown as Record<string, MantineColorsTuple>,
    primaryShade: {
      light: currentTheme.primaryShade.light as MantineColorShade,
      dark: currentTheme.primaryShade.dark as MantineColorShade,
    },
    primaryColor: currentTheme.primaryColor,
    autoContrast: currentTheme.autoContrast,
    luminanceThreshold: currentTheme.luminanceThreshold,
    fontFamily: currentTheme.fontFamily,
    fontFamilyMonospace: currentTheme.fontFamilyMonospace,
    defaultRadius: currentTheme.defaultRadius,
    headings: currentTheme.headings,
    components: {
      ...currentTheme.components,
      ActionIcon: ActionIcon.extend({
        defaultProps: {
          variant: "transparent",
          color: "gray",
        },
      }),
      Autocomplete: Autocomplete.extend({
        defaultProps: {
          spellCheck: spellCheck,
        },
      }),
      Textarea: Textarea.extend({
        defaultProps: {
          spellCheck: spellCheck,
        },
      }),
      TextInput: TextInput.extend({
        defaultProps: {
          spellCheck: spellCheck,
        },
      }),
    },
  };

  return (
    <DirectionProvider>
      <MantineProvider theme={createTheme(config)} defaultColorScheme={colorScheme}>
        <ColorSchemeSync>{children}</ColorSchemeSync>
      </MantineProvider>
    </DirectionProvider>
  );
}

export default ThemeProvider;
