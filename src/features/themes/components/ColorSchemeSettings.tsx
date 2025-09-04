import { Box, Center, Group, SegmentedControl } from "@mantine/core";
import { IconMoon, IconSun, IconSunMoon } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { colorSchemeAtom } from "../state/themeAtoms";

export default function ColorSchemeSettings() {
  const { t } = useTranslation();
  const [colorScheme, setColorScheme] = useAtom(colorSchemeAtom);

  return (
    <Group justify="center">
      <SegmentedControl
        value={colorScheme}
        onChange={(value) => setColorScheme(value as "light" | "dark" | "auto")}
        data={[
          {
            value: "auto",
            label: (
              <Center>
                <IconSunMoon size="1rem" stroke={1.5} />
                <Box ml={10}>{t("Settings.Appearance.ColorScheme.Auto")}</Box>
              </Center>
            ),
          },
          {
            value: "light",
            label: (
              <Center>
                <IconSun size="1rem" stroke={1.5} />
                <Box ml={10}>{t("Settings.Appearance.ColorScheme.Light")}</Box>
              </Center>
            ),
          },
          {
            value: "dark",
            label: (
              <Center>
                <IconMoon size="1rem" stroke={1.5} />
                <Box ml={10}>{t("Settings.Appearance.ColorScheme.Dark")}</Box>
              </Center>
            ),
          },
        ]}
      />
    </Group>
  );
}
