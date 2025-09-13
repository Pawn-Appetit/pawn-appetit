import {
  ActionIcon,
  Button,
  Card,
  Collapse,
  ColorSwatch,
  Divider,
  Group,
  JsonInput,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import {
  IconChevronDown,
  IconChevronRight,
  IconCode,
  IconPalette,
  IconPlus,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ThemeComponents } from "../types/theme";

interface ComponentThemeEditorProps {
  components: ThemeComponents;
  onChange: (components: ThemeComponents) => void;
  availableColors: string[];
}

interface ComponentTheme {
  defaultProps?: Record<string, unknown>;
  styles?: Record<string, unknown>;
}

interface ComponentEditorProps {
  componentName: string;
  componentTheme: ComponentTheme;
  onChange: (componentTheme: ComponentTheme) => void;
  onDelete: () => void;
  availableColors: string[];
}

// Common Mantine components that can be themed
const COMMON_COMPONENTS = [
  "Button",
  "Input",
  "Card",
  "Paper",
  "Modal",
  "Tooltip",
  "Badge",
  "Menu",
  "Tabs",
  "Accordion",
  "Table",
  "Navbar",
  "Header",
  "Footer",
  "Sidebar",
  "ActionIcon",
  "Text",
  "Title",
  "Group",
  "Stack",
  "Center",
  "Container",
  "Divider",
  "Anchor",
  "List",
  "Checkbox",
  "Radio",
  "Switch",
  "Slider",
  "Progress",
  "Loader",
  "Alert",
  "Notification",
  "Select",
  "MultiSelect",
  "TextInput",
  "PasswordInput",
  "NumberInput",
  "Textarea",
  "DatePicker",
  "ColorPicker",
];

// Common props that can be themed
const COMPONENT_PROPS = {
  Button: {
    size: ["xs", "sm", "md", "lg", "xl"],
    variant: ["filled", "light", "outline", "subtle", "transparent", "gradient"],
    color: "color-select",
    radius: ["xs", "sm", "md", "lg", "xl"],
  },
  Input: {
    size: ["xs", "sm", "md", "lg", "xl"],
    variant: ["default", "filled", "unstyled"],
    radius: ["xs", "sm", "md", "lg", "xl"],
  },
  Card: {
    padding: ["xs", "sm", "md", "lg", "xl"],
    radius: ["xs", "sm", "md", "lg", "xl"],
    shadow: ["xs", "sm", "md", "lg", "xl"],
    withBorder: "boolean",
  },
  Paper: {
    padding: ["xs", "sm", "md", "lg", "xl"],
    radius: ["xs", "sm", "md", "lg", "xl"],
    shadow: ["xs", "sm", "md", "lg", "xl"],
    withBorder: "boolean",
  },
  Text: {
    size: ["xs", "sm", "md", "lg", "xl"],
    fw: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  Title: {
    order: [1, 2, 3, 4, 5, 6],
    fw: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
};

function ComponentEditor({ componentName, componentTheme, onChange, onDelete, availableColors }: ComponentEditorProps) {
  const { t } = useTranslation();
  const [opened, { toggle }] = useDisclosure(false);
  const [propsOpened, { toggle: toggleProps }] = useDisclosure(false);
  const [stylesOpened, { toggle: toggleStyles }] = useDisclosure(false);

  const form = useForm({
    initialValues: {
      defaultProps: componentTheme.defaultProps || {},
      styles: componentTheme.styles || {},
    },
  });

  const handleFormChange = (field: "defaultProps" | "styles", value: Record<string, unknown>) => {
    const updated = { ...componentTheme, [field]: value };
    onChange(updated);
  };

  const addDefaultProp = (propName: string, propValue: unknown) => {
    const newProps = { ...form.values.defaultProps, [propName]: propValue };
    form.setFieldValue("defaultProps", newProps);
    handleFormChange("defaultProps", newProps);
  };

  const removeDefaultProp = (propName: string) => {
    const newProps = { ...form.values.defaultProps };
    delete newProps[propName];
    form.setFieldValue("defaultProps", newProps);
    handleFormChange("defaultProps", newProps);
  };

  const componentProps = COMPONENT_PROPS[componentName as keyof typeof COMPONENT_PROPS] || {};

  return (
    <Card withBorder>
      <Group justify="space-between">
        <Group>
          <ActionIcon variant="subtle" onClick={toggle}>
            {opened ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          </ActionIcon>
          <Text fw={500}>{componentName}</Text>
        </Group>
        <Group>
          <Tooltip label={t("Delete component theme")}>
            <ActionIcon variant="light" color="red" onClick={onDelete}>
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Collapse in={opened}>
        <Stack gap="md" pt="md">
          {/* Default Props */}
          <div>
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                <IconSettings size={16} style={{ verticalAlign: "middle", marginRight: 4 }} />
                Default Props
              </Text>
              <ActionIcon variant="subtle" onClick={toggleProps}>
                {propsOpened ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              </ActionIcon>
            </Group>

            <Collapse in={propsOpened}>
              <Stack gap="sm" mt="sm">
                {/* Available props for this component */}
                {Object.entries(componentProps).map(([propName, propConfig]) => (
                  <Group key={propName} justify="space-between">
                    <Text size="xs" tt="capitalize">
                      {propName}:
                    </Text>
                    {propConfig === "boolean" ? (
                      <Switch
                        size="sm"
                        checked={Boolean(form.values.defaultProps[propName])}
                        onChange={(event) => addDefaultProp(propName, event.currentTarget.checked)}
                      />
                    ) : propConfig === "color-select" ? (
                      <Select
                        size="xs"
                        w={120}
                        data={availableColors}
                        value={String(form.values.defaultProps[propName] || "")}
                        onChange={(value) => value && addDefaultProp(propName, value)}
                        clearable
                        renderOption={({ option }) => (
                          <Group gap="xs">
                            <ColorSwatch color={option.value} size={16} />
                            <Text size="xs">{option.label}</Text>
                          </Group>
                        )}
                      />
                    ) : Array.isArray(propConfig) ? (
                      <Select
                        size="xs"
                        w={120}
                        data={propConfig.map((val) => ({ value: String(val), label: String(val) }))}
                        value={String(form.values.defaultProps[propName] || "")}
                        onChange={(value) => {
                          if (value) {
                            const numValue = Number(value);
                            addDefaultProp(propName, Number.isNaN(numValue) ? value : numValue);
                          }
                        }}
                        clearable
                      />
                    ) : (
                      <TextInput
                        size="xs"
                        w={120}
                        value={String(form.values.defaultProps[propName] || "")}
                        onChange={(event) => addDefaultProp(propName, event.currentTarget.value)}
                      />
                    )}
                    {form.values.defaultProps[propName] !== undefined && (
                      <ActionIcon size="xs" variant="subtle" color="red" onClick={() => removeDefaultProp(propName)}>
                        <IconTrash size={12} />
                      </ActionIcon>
                    )}
                  </Group>
                ))}

                {/* Custom prop input */}
                <Group justify="space-between">
                  <TextInput
                    placeholder="Custom prop name"
                    size="xs"
                    onKeyPress={(event) => {
                      if (event.key === "Enter") {
                        const target = event.target as HTMLInputElement;
                        const propName = target.value.trim();
                        if (propName && !form.values.defaultProps[propName]) {
                          addDefaultProp(propName, "");
                          target.value = "";
                        }
                      }
                    }}
                  />
                  <Text size="xs" c="dimmed">
                    Press Enter to add
                  </Text>
                </Group>
              </Stack>
            </Collapse>
          </div>

          <Divider />

          {/* Custom Styles */}
          <div>
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                <IconCode size={16} style={{ verticalAlign: "middle", marginRight: 4 }} />
                Custom Styles
              </Text>
              <ActionIcon variant="subtle" onClick={toggleStyles}>
                {stylesOpened ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              </ActionIcon>
            </Group>

            <Collapse in={stylesOpened}>
              <JsonInput
                mt="sm"
                placeholder="Custom CSS-in-JS styles"
                value={JSON.stringify(form.values.styles, null, 2)}
                onChange={(value) => {
                  try {
                    const parsed = JSON.parse(value);
                    form.setFieldValue("styles", parsed);
                    handleFormChange("styles", parsed);
                  } catch {
                    // Invalid JSON, don't update
                  }
                }}
                autosize
                minRows={3}
                maxRows={10}
              />
            </Collapse>
          </div>
        </Stack>
      </Collapse>
    </Card>
  );
}

export default function ComponentThemeEditor({ components, onChange, availableColors }: ComponentThemeEditorProps) {
  const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false);
  const [selectedComponent, setSelectedComponent] = useState<string>("");

  const handleAddComponent = () => {
    if (selectedComponent && !components[selectedComponent]) {
      const newComponents = {
        ...components,
        [selectedComponent]: {
          defaultProps: {},
          styles: {},
        },
      };
      onChange(newComponents);
      setSelectedComponent("");
      closeAddModal();
    }
  };

  const handleUpdateComponent = (componentName: string, componentTheme: ComponentTheme) => {
    const newComponents = {
      ...components,
      [componentName]: componentTheme,
    };
    onChange(newComponents);
  };

  const handleDeleteComponent = (componentName: string) => {
    const newComponents = { ...components };
    delete newComponents[componentName];
    onChange(newComponents);
  };

  const availableToAdd = COMMON_COMPONENTS.filter((comp) => !components[comp]);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Title order={4}>Component Theming</Title>
          <Text size="sm" c="dimmed">
            Customize default props and styles for Mantine components
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={openAddModal} disabled={availableToAdd.length === 0}>
          Add Component
        </Button>
      </Group>

      {Object.keys(components).length === 0 ? (
        <Card withBorder p="xl">
          <Stack align="center" gap="md">
            <IconPalette size={48} color="var(--mantine-color-dimmed)" />
            <div style={{ textAlign: "center" }}>
              <Text size="lg" fw={500}>
                No component themes
              </Text>
              <Text size="sm" c="dimmed">
                Add component themes to customize default props and styles
              </Text>
            </div>
          </Stack>
        </Card>
      ) : (
        <ScrollArea.Autosize mah={600}>
          <Stack gap="md">
            {Object.entries(components).map(([componentName, componentTheme]) => (
              <ComponentEditor
                key={componentName}
                componentName={componentName}
                componentTheme={componentTheme}
                onChange={(updated) => handleUpdateComponent(componentName, updated)}
                onDelete={() => handleDeleteComponent(componentName)}
                availableColors={availableColors}
              />
            ))}
          </Stack>
        </ScrollArea.Autosize>
      )}

      {/* Add Component Modal */}
      <Modal opened={addModalOpened} onClose={closeAddModal} title="Add Component Theme" centered>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Select a Mantine component to add custom theming for:
          </Text>

          <Select
            label="Component"
            placeholder="Choose a component"
            data={availableToAdd}
            value={selectedComponent}
            onChange={(value) => setSelectedComponent(value || "")}
            searchable
            required
          />

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={closeAddModal}>
              Cancel
            </Button>
            <Button onClick={handleAddComponent} disabled={!selectedComponent}>
              Add Component
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
