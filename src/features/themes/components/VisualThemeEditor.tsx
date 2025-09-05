import {
  ActionIcon,
  Button,
  Card,
  Collapse,
  ColorPicker,
  ColorSwatch,
  Divider,
  Group,
  Modal,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconColorPicker,
  IconDeviceFloppy,
  IconEye,
  IconPalette,
  IconRefresh,
  IconSettings,
} from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createThemeAtom, currentThemeAtom, updateThemeAtom } from "../state/themeAtoms";
import type { Theme, ThemeColors, ThemeComponents } from "../types/theme";
import { generateColorShades } from "../utils/colorUtils";
import ComponentThemeEditor from "./ComponentThemeEditor";
import ThemePreview from "./ThemePreview";

interface VisualThemeEditorProps {
  opened: boolean;
  onClose: () => void;
  themeId?: string;
  isCreate?: boolean;
}

interface ColorPaletteEditorProps {
  colorName: string;
  colors: string[];
  onChange: (colors: string[]) => void;
}

function ColorPaletteEditor({ colorName, colors, onChange }: ColorPaletteEditorProps) {
  const [baseColor, setBaseColor] = useState(colors[5] || "#228be6");

  const handleBaseColorChange = (color: string) => {
    setBaseColor(color);
    const newShades = generateColorShades(color);
    onChange(newShades);
  };

  const handleShadeChange = (index: number, color: string) => {
    const newColors = [...colors];
    newColors[index] = color;
    onChange(newColors);
  };

  return (
    <Card withBorder p="md">
      <Group justify="space-between" mb="sm">
        <Text fw={500} tt="capitalize">
          {colorName}
        </Text>
        <Group gap="xs">
          <ColorPicker value={baseColor} onChange={handleBaseColorChange} format="hex" size="xs" swatches={[]} />
          <ActionIcon
            variant="light"
            size="sm"
            onClick={() => handleBaseColorChange(baseColor)}
            title="Generate shades from base color"
          >
            <IconRefresh size={14} />
          </ActionIcon>
        </Group>
      </Group>

      <Stack gap="xs">
        {colors.map((color, index) => (
          <Group key={`${colorName}-${index}`} justify="space-between" gap="xs">
            <Text size="xs" c="dimmed" w={30}>
              {index}
            </Text>
            <ColorSwatch
              color={color}
              size={20}
              style={{ cursor: "pointer" }}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "color";
                input.value = color;
                input.onchange = (e) => {
                  const target = e.target as HTMLInputElement;
                  handleShadeChange(index, target.value);
                };
                input.click();
              }}
            />
            <TextInput
              value={color}
              onChange={(e) => handleShadeChange(index, e.target.value)}
              size="xs"
              style={{ flex: 1 }}
            />
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

export default function VisualThemeEditor({ opened, onClose, themeId, isCreate = false }: VisualThemeEditorProps) {
  const { t } = useTranslation();
  const currentTheme = useAtomValue(currentThemeAtom);
  const [, updateTheme] = useAtom(updateThemeAtom);
  const [, createTheme] = useAtom(createThemeAtom);

  const [previewOpened, { toggle: togglePreview }] = useDisclosure(false);
  const [activeTab, setActiveTab] = useState<string | null>("basic");

  // Form state for editing theme
  const form = useForm<Theme>({
    initialValues: isCreate
      ? {
          description: "",
          author: "",
          version: "1.0.0",
          ...currentTheme,
        }
      : currentTheme,
  });

  // Local state for colors
  const [colors, setColors] = useState<ThemeColors>(form.values.colors);

  const handleColorChange = (colorName: string, newColors: string[]) => {
    const updatedColors = { ...colors, [colorName]: newColors };
    setColors(updatedColors);
    form.setFieldValue("colors", updatedColors);
  };

  const handleSave = () => {
    try {
      const themeData = {
        ...form.values,
        colors,
        updatedAt: new Date().toISOString(),
      };

      if (isCreate) {
        const newTheme = createTheme(themeData);
        notifications.show({
          title: t("settings.appearance.theme.created"),
          message: t("settings.appearance.theme.createdMessage", { name: newTheme.name }),
          color: "green",
        });
      } else if (themeId) {
        updateTheme({ id: themeId, updates: themeData });
        notifications.show({
          title: t("settings.appearance.theme.Updated"),
          message: t("settings.appearance.theme.UpdatedMessage", { name: themeData.name }),
          color: "blue",
        });
      }

      onClose();
    } catch {
      notifications.show({
        title: t("Error"),
        message: t("settings.appearance.theme.saveError"),
        color: "red",
      });
    }
  };

  const colorEntries = Object.entries(colors);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isCreate ? t("settings.appearance.theme.createNew") : t("settings.appearance.theme.editTheme")}
      size="xl"
      centered
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="md">
        {/* Preview Toggle */}
        <Group justify="space-between">
          <Button variant="light" leftSection={<IconEye size={16} />} onClick={togglePreview}>
            {previewOpened ? t("settings.appearance.theme.hidePreview") : t("settings.appearance.theme.showPreview")}
          </Button>
          <Group>
            <Button variant="outline" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button leftSection={<IconDeviceFloppy size={16} />} onClick={handleSave}>
              {isCreate ? t("Create") : t("Save")}
            </Button>
          </Group>
        </Group>

        <Divider />

        {/* Preview */}
        <Collapse in={previewOpened}>
          <ThemePreview theme={{ ...form.values, colors }} />
        </Collapse>

        <Divider />

        {/* Editor Tabs */}
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="basic" leftSection={<IconSettings size={16} />}>
              {t("settings.appearance.theme.basic")}
            </Tabs.Tab>
            <Tabs.Tab value="colors" leftSection={<IconPalette size={16} />}>
              {t("settings.appearance.theme.colors")}
            </Tabs.Tab>
            <Tabs.Tab value="components" leftSection={<IconColorPicker size={16} />}>
              {t("settings.appearance.theme.components")}
            </Tabs.Tab>
          </Tabs.List>

          {/* Basic Settings */}
          <Tabs.Panel value="basic" pt="md">
            <Stack gap="md">
              <Group grow>
                <TextInput
                  label={t("settings.appearance.theme.name")}
                  placeholder={t("settings.appearance.theme.namePlaceholder")}
                  required
                  {...form.getInputProps("name")}
                />
                <TextInput
                  label={t("settings.appearance.theme.author")}
                  placeholder={t("settings.appearance.theme.authorPlaceholder")}
                  {...form.getInputProps("author")}
                />
              </Group>

              <TextInput
                label={t("settings.appearance.theme.description")}
                placeholder={t("settings.appearance.theme.descriptionPlaceholder")}
                {...form.getInputProps("description")}
              />

              <Group grow>
                <Select
                  label={t("settings.appearance.theme.primaryColor")}
                  data={Object.keys(colors)}
                  {...form.getInputProps("primaryColor")}
                />
                <Select
                  label={t("settings.appearance.theme.defaultRadius")}
                  data={[
                    { value: "xs", label: "XS" },
                    { value: "sm", label: "SM" },
                    { value: "md", label: "MD" },
                    { value: "lg", label: "LG" },
                    { value: "xl", label: "XL" },
                  ]}
                  {...form.getInputProps("defaultRadius")}
                />
              </Group>

              <Group grow>
                <TextInput
                  label={t("settings.appearance.theme.fontFamily")}
                  placeholder="system-ui, sans-serif"
                  {...form.getInputProps("fontFamily")}
                />
                <TextInput
                  label={t("settings.appearance.theme.monospaceFont")}
                  placeholder="ui-monospace, monospace"
                  {...form.getInputProps("fontFamilyMonospace")}
                />
              </Group>

              <Group grow>
                <NumberInput
                  label={t("settings.appearance.theme.scale")}
                  min={0.5}
                  max={2}
                  step={0.1}
                  decimalScale={1}
                  {...form.getInputProps("scale")}
                />
                <NumberInput
                  label={t("settings.appearance.theme.luminanceThreshold")}
                  min={0}
                  max={1}
                  step={0.05}
                  decimalScale={2}
                  {...form.getInputProps("luminanceThreshold")}
                />
              </Group>

              <Group grow>
                <Switch
                  label={t("settings.appearance.theme.fontSmoothing")}
                  {...form.getInputProps("fontSmoothing", { type: "checkbox" })}
                />
                <Switch
                  label={t("settings.appearance.theme.autoContrast")}
                  {...form.getInputProps("autoContrast", { type: "checkbox" })}
                />
              </Group>

              <Select
                label={t("settings.appearance.theme.focusRing")}
                data={[
                  { value: "auto", label: "Auto" },
                  { value: "always", label: "Always" },
                  { value: "never", label: "Never" },
                ]}
                {...form.getInputProps("focusRing")}
              />
            </Stack>
          </Tabs.Panel>

          {/* Colors */}
          <Tabs.Panel value="colors" pt="md">
            <Stack gap="md">
              <Group>
                <ColorSwatch color={form.values.white} size={30} />
                <TextInput
                  label={t("settings.appearance.theme.white")}
                  placeholder="#ffffff"
                  {...form.getInputProps("white")}
                />
                <ColorSwatch color={form.values.black} size={30} />
                <TextInput
                  label={t("settings.appearance.theme.black")}
                  placeholder="#000000"
                  {...form.getInputProps("black")}
                />
              </Group>

              <Divider label={t("settings.appearance.theme.colorPalettes")} labelPosition="center" />

              <ScrollArea.Autosize mah={600}>
                <Stack gap="md">
                  {colorEntries.map(([colorName, colorShades]) => (
                    <ColorPaletteEditor
                      key={colorName}
                      colorName={colorName}
                      colors={colorShades}
                      onChange={(newColors) => handleColorChange(colorName, newColors)}
                    />
                  ))}
                </Stack>
              </ScrollArea.Autosize>

              <Button
                variant="light"
                leftSection={<IconColorPicker size={16} />}
                onClick={() => {
                  const newColorName = prompt(t("settings.appearance.theme.newColorName"));
                  if (newColorName && !colors[newColorName]) {
                    handleColorChange(newColorName, generateColorShades("#228be6"));
                  }
                }}
              >
                {t("settings.appearance.theme.addColor")}
              </Button>
            </Stack>
          </Tabs.Panel>

          {/* Components */}
          <Tabs.Panel value="components" pt="md">
            <ComponentThemeEditor
              components={form.values.components || {}}
              onChange={(components: ThemeComponents) => form.setFieldValue("components", components)}
              availableColors={Object.keys(colors)}
            />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Modal>
  );
}
