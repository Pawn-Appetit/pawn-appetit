import {
  ActionIcon,
  Button,
  Card,
  Center,
  Group,
  Modal,
  rem,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { useId } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconDownload,
  IconEdit,
  IconFileImport,
  IconMoon,
  IconPalette,
  IconSun,
  IconSunMoon,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as classes from "@/features/settings/SettingsPage.css";
import { useTheme, useThemeCustomization, useThemeDetection } from "../hooks";
import type { ThemeDefinition } from "../types";
import ThemeEditor from "./ThemeEditor";

export function ThemeSettings() {
  const { t } = useTranslation();
  const { currentTheme, availableThemes, setTheme, autoDetectEnabled, getTheme } = useTheme();
  const { createCustomTheme, deleteCustomTheme, exportTheme, saveCustomTheme } = useThemeCustomization();
  const { toggleAutoDetection } = useThemeDetection();
  const [editorOpened, setEditorOpened] = useState(false);
  const [editingTheme, setEditingTheme] = useState<ThemeDefinition | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const fileInputId = useId();

  const handleQuickThemeChange = (value: string) => {
    if (value === "auto") {
      if (!autoDetectEnabled) {
        toggleAutoDetection();
      }
    } else if (value === "custom") {
      if (autoDetectEnabled) {
        toggleAutoDetection();
      }

      const currentThemeMetadata = availableThemes.find((t) => t.name === currentTheme?.name);
      if (!currentThemeMetadata?.isCustom) {
        const firstCustomTheme = availableThemes.find((theme) => theme.isCustom);
        if (firstCustomTheme) {
          setTheme(firstCustomTheme.name);
        } else {
          if (currentTheme) {
            const customTheme = createCustomTheme(currentTheme, {
              name: `custom-${Date.now()}`,
              displayName: `Custom ${currentTheme.displayName}`,
              description: `Custom theme based on ${currentTheme.displayName}`,
            });

            saveCustomTheme(customTheme);
            setTheme(customTheme.name);

            notifications.show({
              title: "Custom Theme Created",
              message: `Created custom theme "${customTheme.displayName}"`,
              color: "green",
              icon: <IconCheck size={18} />,
            });
          }
        }
      }
    } else {
      if (autoDetectEnabled) {
        toggleAutoDetection();
      }

      const targetTheme = availableThemes.find((theme) => theme.type === value && !theme.isCustom);

      if (targetTheme) {
        setTheme(targetTheme.name);
      }
    }
  };

  const getCurrentQuickValue = () => {
    if (autoDetectEnabled) return "auto";

    const currentThemeMetadata = availableThemes.find((t) => t.name === currentTheme?.name);
    if (currentThemeMetadata?.isCustom) return "custom";

    return currentTheme?.type || "light";
  };

  const handleManualThemeChange = (themeName: string) => {
    if (autoDetectEnabled) {
      toggleAutoDetection();
    }
    setTheme(themeName);
  };

  const handleCreateCustomTheme = () => {
    if (currentTheme) {
      const customTheme = createCustomTheme(currentTheme, {
        name: `custom-${Date.now()}`,
        displayName: `Custom ${currentTheme.displayName}`,
        description: `Custom theme based on ${currentTheme.displayName}`,
      });

      saveCustomTheme(customTheme);

      notifications.show({
        title: "Custom Theme Created",
        message: `Created custom theme "${customTheme.displayName}"`,
        color: "green",
        icon: <IconCheck size={18} />,
      });
    }
  };

  const handleEditTheme = (themeName: string) => {
    const theme = getTheme(themeName);
    if (theme) {
      setEditingTheme(theme);
      setEditorOpened(true);
    }
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const importedTheme = JSON.parse(content);

          if (!importedTheme.name || !importedTheme.displayName || !importedTheme.colors) {
            throw new Error("Invalid theme format");
          }

          const customTheme = createCustomTheme(importedTheme, {
            name: `imported-${Date.now()}`,
            displayName: importedTheme.displayName,
            description: importedTheme.description || "Imported theme",
          });

          saveCustomTheme(customTheme);

          notifications.show({
            title: "Theme Imported",
            message: `Successfully imported "${customTheme.displayName}"`,
            color: "green",
            icon: <IconCheck size={18} />,
          });
        } catch {
          notifications.show({
            title: "Import Failed",
            message: "Invalid theme file format",
            color: "red",
          });
        }

        event.target.value = "";
      };
      reader.readAsText(file);
    }
  };

  const handleImportTheme = () => {
    try {
      const importedTheme = JSON.parse(importJson);

      if (!importedTheme.name || !importedTheme.displayName || !importedTheme.colors) {
        throw new Error("Invalid theme format");
      }

      const customTheme = createCustomTheme(importedTheme, {
        name: `imported-${Date.now()}`,
        displayName: importedTheme.displayName,
        description: importedTheme.description || "Imported theme",
      });

      saveCustomTheme(customTheme);
      setImportModalOpen(false);
      setImportJson("");

      notifications.show({
        title: "Theme Imported",
        message: `Successfully imported "${customTheme.displayName}"`,
        color: "green",
        icon: <IconCheck size={18} />,
      });
    } catch {
      notifications.show({
        title: "Import Failed",
        message: "Invalid theme JSON format",
        color: "red",
        icon: <IconX size={18} />,
      });
    }
  };

  const handleExportTheme = (themeName: string) => {
    const data = exportTheme(themeName);
    if (data) {
      try {
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${themeName}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notifications.show({
          title: "Theme Exported",
          message: `Successfully exported theme "${themeName}"`,
          color: "green",
          icon: <IconCheck size={18} />,
        });
      } catch (error) {
        notifications.show({
          title: "Export Failed",
          message: error instanceof Error ? error.message : "Could not export theme.",
          color: "red",
          icon: <IconX size={18} />,
        });
      }
    } else {
      notifications.show({
        title: "Export Failed",
        message: `Theme "${themeName}" could not be exported.`,
        color: "red",
        icon: <IconX size={18} />,
      });
    }
  };

  return (
    <Stack gap="xl">
      <Group justify="space-between" wrap="nowrap" gap="xl" className={classes.item}>
        <div>
          <Text>{t("Settings.Appearance.Theme", "Theme")}</Text>
          <Text size="xs" c="dimmed">
            {t("Settings.Appearance.Theme.Desc", "Overall color scheme")}
          </Text>
        </div>

        <SegmentedControl
          value={getCurrentQuickValue()}
          onChange={handleQuickThemeChange}
          data={[
            {
              value: "auto",
              label: (
                <Center>
                  <IconSunMoon size={16} />
                  <Text size="sm" ml={10}>
                    {t("Settings.Appearance.Theme.Auto", "Auto")}
                  </Text>
                </Center>
              ),
            },
            {
              value: "light",
              label: (
                <Center>
                  <IconSun size={16} />
                  <Text size="sm" ml={10}>
                    {t("Settings.Appearance.Theme.Light", "Light")}
                  </Text>
                </Center>
              ),
            },
            {
              value: "dark",
              label: (
                <Center>
                  <IconMoon size={16} />
                  <Text size="sm" ml={10}>
                    {t("Settings.Appearance.Theme.Dark", "Dark")}
                  </Text>
                </Center>
              ),
            },
            {
              value: "custom",
              label: (
                <Center>
                  <IconPalette size={16} />
                  <Text size="sm" ml={10}>
                    {t("Settings.Appearance.Theme.Custom", "Custom")}
                  </Text>
                </Center>
              ),
            },
          ]}
          fullWidth
        />
      </Group>

      {/* Custom Themes Section */}
      {getCurrentQuickValue() === "custom" && (
        <Stack gap="md">
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              Custom Themes
            </Text>
            <Group gap="xs">
              <Tooltip label="Import from file">
                <ActionIcon variant="subtle" component="label" htmlFor={fileInputId}>
                  <IconUpload size={16} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Import from JSON">
                <ActionIcon variant="subtle" onClick={() => setImportModalOpen(true)}>
                  <IconFileImport size={16} />
                </ActionIcon>
              </Tooltip>

              <Button
                variant="outline"
                leftSection={<IconPalette size={16} />}
                size="xs"
                onClick={handleCreateCustomTheme}
                disabled={!currentTheme}
              >
                Create New Theme
              </Button>
            </Group>
          </Group>

          <Stack gap="xs">
            {availableThemes
              .filter((theme) => theme.isCustom)
              .map((theme) => (
                <Card
                  key={theme.name}
                  p="sm"
                  withBorder
                  style={{
                    cursor: "pointer",
                    borderColor: currentTheme?.name === theme.name ? "var(--mantine-primary-color-filled)" : undefined,
                    backgroundColor: currentTheme?.name === theme.name ? "var(--mantine-color-blue-light)" : undefined,
                  }}
                  onClick={() => handleManualThemeChange(theme.name)}
                >
                  <Group justify="space-between" align="center">
                    <Group gap="sm">
                      {theme.type === "light" ? (
                        <IconSun size={16} color="var(--mantine-color-yellow-6)" />
                      ) : (
                        <IconMoon size={16} color="var(--mantine-color-indigo-6)" />
                      )}
                      <div>
                        <Text size="sm" fw={500}>
                          {theme.displayName}
                        </Text>
                        {theme.description && (
                          <Text size="xs" c="dimmed">
                            {theme.description}
                          </Text>
                        )}
                      </div>
                    </Group>

                    <Group gap="xs">
                      <Tooltip label="Edit theme">
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditTheme(theme.name);
                          }}
                        >
                          <IconEdit size={14} />
                        </ActionIcon>
                      </Tooltip>

                      <Tooltip label="Export theme">
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportTheme(theme.name);
                          }}
                        >
                          <IconDownload size={14} />
                        </ActionIcon>
                      </Tooltip>

                      <Tooltip label="Delete theme">
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          color="red"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCustomTheme(theme.uuid);
                          }}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                </Card>
              ))}

            {availableThemes.filter((theme) => theme.isCustom).length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="xl">
                No custom themes yet. Create your first custom theme to get started.
              </Text>
            )}
          </Stack>
        </Stack>
      )}

      <input type="file" id={fileInputId} accept=".json" style={{ display: "none" }} onChange={handleFileImport} />

      <ThemeEditor
        theme={editingTheme}
        opened={editorOpened}
        onClose={() => {
          setEditorOpened(false);
          setEditingTheme(null);
        }}
      />

      <Modal opened={importModalOpen} onClose={() => setImportModalOpen(false)} title="Import Theme" size="lg">
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Paste the JSON content of a theme file below:
          </Text>

          <Textarea
            placeholder="Paste theme JSON here..."
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            minRows={10}
            maxRows={15}
            autosize
          />

          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setImportModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleImportTheme} disabled={!importJson.trim()}>
              Import Theme
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

export default ThemeSettings;
