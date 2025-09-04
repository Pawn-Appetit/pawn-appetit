import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Divider,
  FileInput,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconCopy, IconDownload, IconEdit, IconPlus, IconTrash, IconUpload } from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { defaultTheme } from "../data/builtInThemes";
import {
  allThemesAtom,
  createThemeAtom,
  deleteThemeAtom,
  duplicateThemeAtom,
  importThemeAtom,
  setCurrentThemeAtom,
  themeOperationsAtom,
} from "../state/themeAtoms";
import type { Theme, ThemeExport } from "../types/theme";
import VisualThemeEditor from "./VisualThemeEditor";

interface ThemeManagerProps {
  opened: boolean;
  onClose: () => void;
}

interface ThemeCardProps {
  theme: Theme;
  onEdit: (theme: Theme) => void;
  onDelete: (theme: Theme) => void;
  onDuplicate: (theme: Theme) => void;
  onExport: (theme: Theme) => void;
  onApply: (theme: Theme) => void;
}

function ThemeCard({ theme, onEdit, onDelete, onDuplicate, onExport, onApply }: ThemeCardProps) {
  const { t } = useTranslation();

  return (
    <Card withBorder p="md">
      <Group justify="space-between" mb="xs">
        <div>
          <Group gap="xs">
            <Text fw={500}>{theme.name}</Text>
            {theme.isBuiltIn && (
              <Badge size="xs" variant="light">
                {t("Settings.Appearance.Theme.BuiltIn")}
              </Badge>
            )}
          </Group>
          {theme.description && (
            <Text size="sm" c="dimmed">
              {theme.description}
            </Text>
          )}
          {theme.author && (
            <Text size="xs" c="dimmed">
              by {theme.author}
            </Text>
          )}
        </div>

        <Group gap="xs">
          <Tooltip label={t("Settings.Appearance.Theme.Apply")}>
            <ActionIcon variant="light" color="blue" onClick={() => onApply(theme)}>
              <IconCheck size={16} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label={t("Settings.Appearance.Theme.Duplicate")}>
            <ActionIcon variant="light" onClick={() => onDuplicate(theme)}>
              <IconCopy size={16} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label={t("Settings.Appearance.Theme.Export")}>
            <ActionIcon variant="light" onClick={() => onExport(theme)}>
              <IconDownload size={16} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label={t("Settings.Appearance.Theme.Edit")}>
            <ActionIcon variant="light" color="yellow" onClick={() => onEdit(theme)}>
              <IconEdit size={16} />
            </ActionIcon>
          </Tooltip>

          {!theme.isBuiltIn && (
            <Tooltip label={t("Settings.Appearance.Theme.Delete")}>
              <ActionIcon variant="light" color="red" onClick={() => onDelete(theme)}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
    </Card>
  );
}

export default function ThemeManager({ opened, onClose }: ThemeManagerProps) {
  const { t } = useTranslation();
  const allThemes = useAtomValue(allThemesAtom);
  const themeOperations = useAtomValue(themeOperationsAtom);
  const [, createTheme] = useAtom(createThemeAtom);
  const [, deleteTheme] = useAtom(deleteThemeAtom);
  const [, duplicateTheme] = useAtom(duplicateThemeAtom);
  const [, importTheme] = useAtom(importThemeAtom);
  const [, setCurrentTheme] = useAtom(setCurrentThemeAtom);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [visualEditorOpen, setVisualEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);

  const createForm = useForm({
    initialValues: {
      name: "",
      description: "",
      author: "",
    },
    validate: {
      name: (value) => (value.length < 2 ? t("Settings.Appearance.Theme.NameRequired") : null),
    },
  });

  const builtInThemes = allThemes.filter((theme) => theme.isBuiltIn);
  const customThemes = allThemes.filter((theme) => !theme.isBuiltIn);

  const handleCreateTheme = (values: typeof createForm.values) => {
    try {
      const newTheme = createTheme({
        ...defaultTheme,
        ...values,
        isBuiltIn: false,
      });

      notifications.show({
        title: t("Settings.Appearance.Theme.Created"),
        message: t("Settings.Appearance.Theme.CreatedMessage", newTheme.name),
        color: "green",
      });

      setCreateModalOpen(false);
      createForm.reset();
    } catch {
      notifications.show({
        title: t("Error"),
        message: t("Settings.Appearance.Theme.CreateError"),
        color: "red",
      });
    }
  };

  const handleDeleteTheme = (theme: Theme) => {
    try {
      const success = deleteTheme(theme.id);
      if (success) {
        notifications.show({
          title: t("Settings.Appearance.Theme.Deleted"),
          message: t("Settings.Appearance.Theme.DeletedMessage", theme.name),
          color: "green",
        });
      }
    } catch {
      notifications.show({
        title: t("Error"),
        message: t("Settings.Appearance.Theme.DeleteError"),
        color: "red",
      });
    }
  };

  const handleDuplicateTheme = (theme: Theme) => {
    try {
      const duplicatedTheme = duplicateTheme({ id: theme.id, newName: `${theme.name} Copy` });
      if (duplicatedTheme) {
        notifications.show({
          title: t("Settings.Appearance.Theme.Duplicated"),
          message: t("Settings.Appearance.Theme.DuplicatedMessage", duplicatedTheme.name),
          color: "green",
        });
      }
    } catch {
      notifications.show({
        title: t("Error"),
        message: t("Settings.Appearance.Theme.DuplicateError"),
        color: "red",
      });
    }
  };

  const handleExportTheme = (theme: Theme) => {
    try {
      const exportData = themeOperations.export(theme.id);
      if (exportData) {
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${theme.name.toLowerCase().replace(/\s+/g, "-")}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        notifications.show({
          title: t("Settings.Appearance.Theme.Exported"),
          message: t("Settings.Appearance.Theme.ExportedMessage", theme.name),
          color: "green",
        });
      }
    } catch {
      notifications.show({
        title: t("Error"),
        message: t("Settings.Appearance.Theme.ExportError"),
        color: "red",
      });
    }
  };

  const handleImportTheme = async () => {
    if (!importFile) return;

    try {
      const text = await importFile.text();
      const themeData = JSON.parse(text) as ThemeExport;

      const importedTheme = importTheme(themeData);

      notifications.show({
        title: t("Settings.Appearance.Theme.Imported"),
        message: t("Settings.Appearance.Theme.ImportedMessage", importedTheme.name),
        color: "green",
      });

      setImportFile(null);
    } catch {
      notifications.show({
        title: t("Error"),
        message: t("Settings.Appearance.Theme.ImportError"),
        color: "red",
      });
    }
  };

  const handleApplyTheme = (theme: Theme) => {
    setCurrentTheme(theme.id);
    notifications.show({
      title: t("Settings.Appearance.Theme.Applied"),
      message: t("Settings.Appearance.Theme.AppliedMessage", theme.name),
      color: "blue",
    });
  };

  const handleEditTheme = (theme: Theme) => {
    setEditingTheme(theme);
    setVisualEditorOpen(true);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("Settings.Appearance.Theme.ManageTitle")} size="xl">
      <Stack gap="md">
        {/* Import/Create Actions */}
        <Group justify="space-between">
          <Group>
            <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateModalOpen(true)}>
              {t("Settings.Appearance.Theme.CreateNew")}
            </Button>

            <Button 
              variant="light" 
              leftSection={<IconEdit size={16} />} 
              onClick={() => {
                setEditingTheme(null);
                setVisualEditorOpen(true);
              }}
            >
              {t("Settings.Appearance.Theme.VisualEditor")}
            </Button>

            <FileInput
              placeholder={t("Settings.Appearance.Theme.Import")}
              value={importFile}
              onChange={setImportFile}
              accept=".json"
              leftSection={<IconUpload size={16} />}
              clearable
            />

            {importFile && (
              <Button variant="light" onClick={handleImportTheme}>
                {t("Settings.Appearance.Theme.ImportFile")}
              </Button>
            )}
          </Group>
        </Group>

        <Divider />

        {/* Built-in Themes */}
        <div>
          <Title order={4} mb="sm">
            {t("Settings.Appearance.Theme.BuiltInThemes")}
          </Title>
          <ScrollArea.Autosize mah={200}>
            <Stack gap="xs">
              {builtInThemes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  onEdit={handleEditTheme}
                  onDelete={handleDeleteTheme}
                  onDuplicate={handleDuplicateTheme}
                  onExport={handleExportTheme}
                  onApply={handleApplyTheme}
                />
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </div>

        <Divider />

        {/* Custom Themes */}
        <div>
          <Title order={4} mb="sm">
            {t("Settings.Appearance.Theme.CustomThemes")}
          </Title>
          <ScrollArea.Autosize mah={300}>
            <Stack gap="xs">
              {customThemes.length === 0 ? (
                <Text c="dimmed" ta="center" py="xl">
                  {t("Settings.Appearance.Theme.NoCustomThemes")}
                </Text>
              ) : (
                customThemes.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    onEdit={handleEditTheme}
                    onDelete={handleDeleteTheme}
                    onDuplicate={handleDuplicateTheme}
                    onExport={handleExportTheme}
                    onApply={handleApplyTheme}
                  />
                ))
              )}
            </Stack>
          </ScrollArea.Autosize>
        </div>
      </Stack>

      {/* Create Theme Modal */}
      <Modal
        opened={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          createForm.reset();
        }}
        title={t("Settings.Appearance.Theme.CreateNew")}
      >
        <form onSubmit={createForm.onSubmit(handleCreateTheme)}>
          <Stack gap="md">
            <TextInput
              label={t("Settings.Appearance.Theme.Name")}
              placeholder={t("Settings.Appearance.Theme.NamePlaceholder")}
              required
              {...createForm.getInputProps("name")}
            />

            <TextInput
              label={t("Settings.Appearance.Theme.Description")}
              placeholder={t("Settings.Appearance.Theme.DescriptionPlaceholder")}
              {...createForm.getInputProps("description")}
            />

            <TextInput
              label={t("Settings.Appearance.Theme.Author")}
              placeholder={t("Settings.Appearance.Theme.AuthorPlaceholder")}
              {...createForm.getInputProps("author")}
            />

            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={() => setCreateModalOpen(false)}>
                {t("Cancel")}
              </Button>
              <Button type="submit">{t("Settings.Appearance.Theme.Create")}</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Visual Theme Editor */}
      <VisualThemeEditor
        opened={visualEditorOpen}
        onClose={() => {
          setVisualEditorOpen(false);
          setEditingTheme(null);
        }}
        themeId={editingTheme?.id}
        isCreate={!editingTheme}
      />
    </Modal>
  );
}
