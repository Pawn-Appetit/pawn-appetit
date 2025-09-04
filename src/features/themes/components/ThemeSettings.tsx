import { ActionIcon, Group, Select, Tooltip } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { allThemesAtom, currentThemeIdAtom, setCurrentThemeAtom } from "../state/themeAtoms";
import ThemeManager from "./ThemeManager";

export default function ThemeSettings() {
  const { t } = useTranslation();
  const currentThemeId = useAtomValue(currentThemeIdAtom);
  const allThemes = useAtomValue(allThemesAtom);
  const [, setCurrentTheme] = useAtom(setCurrentThemeAtom);
  const [managerOpen, setManagerOpen] = useState(false);

  const builtInThemes = allThemes.filter(theme => theme.isBuiltIn);
  const customThemes = allThemes.filter(theme => !theme.isBuiltIn);

  const themeOptions = [
    {
      group: t("Settings.Appearance.Theme.BuiltInThemes"),
      items: builtInThemes.map(theme => ({
        value: theme.id,
        label: theme.name,
      }))
    },
    ...(customThemes.length > 0 ? [{
      group: t("Settings.Appearance.Theme.CustomThemes"),
      items: customThemes.map(theme => ({
        value: theme.id,
        label: theme.name,
      }))
    }] : [])
  ];

  const handleThemeChange = (themeId: string | null) => {
    if (themeId) {
      setCurrentTheme(themeId);
    }
  };

  return (
    <Group justify="space-between" wrap="nowrap">
      <Select
        data={themeOptions}
        value={currentThemeId}
        onChange={handleThemeChange}
        placeholder={t("Settings.Appearance.Theme")}
        w={200}
      />
      <Tooltip label={t("Settings.Appearance.Theme.Manage")}>
        <ActionIcon 
          variant="light" 
          onClick={() => setManagerOpen(true)}
          size="lg"
        >
          <IconSettings size={16} />
        </ActionIcon>
      </Tooltip>
      
      <ThemeManager 
        opened={managerOpen} 
        onClose={() => setManagerOpen(false)} 
      />
    </Group>
  );
}
