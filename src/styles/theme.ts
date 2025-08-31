// theme.ts
import { createTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { themeToVars } from "@mantine/vanilla-extract";
import { type } from "@tauri-apps/plugin-os";

// Do not forget to pass theme to MantineProvider
export const theme = createTheme({
  fontFamily: "serif",
  primaryColor: "cyan",
});

// CSS variables object, can be access in *.css.ts files
export const vars = themeToVars(theme);

const isMobileOs = () => type() === "android" || type() === "ios";

export const useScreenSize = () => {
  const smallScreenMin = useMediaQuery(`(min-width: ${vars.breakpoints.sm})`);
  const mediumScreenMin = useMediaQuery(`(min-width: ${vars.breakpoints.md})`);
  const largeScreenMin = useMediaQuery(`(min-width: ${vars.breakpoints.lg})`);
  const smallScreenMax = useMediaQuery(`(max-width: ${vars.breakpoints.sm})`);
  const mediumScreenMax = useMediaQuery(`(max-width: ${vars.breakpoints.md})`);
  const largeScreenMax = useMediaQuery(`(max-width: ${vars.breakpoints.lg})`);

  return {
    smallScreenMin,
    mediumScreenMin,
    largeScreenMin,
    smallScreenMax,
    mediumScreenMax,
    largeScreenMax,
    isMobile: isMobileOs(),
    isMobileOrSmallScreen: isMobileOs() || smallScreenMax,
  };
};
