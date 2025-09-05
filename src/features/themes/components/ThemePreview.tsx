import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Input,
  Paper,
  Progress,
  Slider,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconBell, IconHeart, IconSearch, IconSettings, IconStar, IconUser } from "@tabler/icons-react";
import type { Theme } from "../types/theme";

interface ThemePreviewProps {
  theme: Theme;
}

export default function ThemePreview({ theme }: ThemePreviewProps) {
  // Sample data for preview
  const tableData = [
    { id: 1, name: "John Doe", email: "john@example.com", role: "Admin" },
    { id: 2, name: "Jane Smith", email: "jane@example.com", role: "User" },
    { id: 3, name: "Bob Johnson", email: "bob@example.com", role: "Moderator" },
  ];

  return (
    <Paper p="xl" withBorder style={{ fontFamily: theme.fontFamily }}>
      <Stack gap="lg">
        <Group justify="space-between">
          <div>
            <Title order={2} style={{ fontFamily: theme.headings?.fontFamily || theme.fontFamily }}>
              Theme Preview
            </Title>
            <Text c="dimmed" size="sm">
              {theme.name} by {theme.author || "Unknown"}
            </Text>
          </div>
          <Group>
            <Badge variant="light" color={theme.primaryColor}>
              {theme.primaryColor}
            </Badge>
            <Badge variant="outline">Preview</Badge>
          </Group>
        </Group>

        {/* Color Palette Preview */}
        <Card withBorder p="md">
          <Title order={4} mb="sm">
            Color Palette
          </Title>
          <Stack gap="xs">
            {Object.entries(theme.colors)
              .slice(0, 6)
              .map(([colorName, shades]) => (
                <Group key={colorName} gap="xs">
                  <Text size="sm" w={80} tt="capitalize">
                    {colorName}:
                  </Text>
                  <Group gap={2}>
                    {shades.map((shade, index) => (
                      <Tooltip key={`${colorName}-shade-${index}`} label={`${colorName}.${index}: ${shade}`}>
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            backgroundColor: shade,
                            borderRadius: 4,
                            border: "1px solid var(--mantine-color-gray-3)",
                            cursor: "pointer",
                          }}
                        />
                      </Tooltip>
                    ))}
                  </Group>
                </Group>
              ))}
          </Stack>
        </Card>

        {/* Component Examples */}
        <Card withBorder p="md">
          <Title order={4} mb="md">
            Component Examples
          </Title>

          <Tabs defaultValue="buttons" variant="outline">
            <Tabs.List>
              <Tabs.Tab value="buttons">Buttons</Tabs.Tab>
              <Tabs.Tab value="inputs">Inputs</Tabs.Tab>
              <Tabs.Tab value="data">Data</Tabs.Tab>
              <Tabs.Tab value="feedback">Feedback</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="buttons" pt="md">
              <Stack gap="md">
                <Group>
                  <Button color={theme.primaryColor}>Primary Button</Button>
                  <Button variant="outline" color={theme.primaryColor}>
                    Outline
                  </Button>
                  <Button variant="light" color={theme.primaryColor}>
                    Light
                  </Button>
                  <Button variant="subtle" color={theme.primaryColor}>
                    Subtle
                  </Button>
                </Group>

                <Group>
                  <Button size="xs">Extra Small</Button>
                  <Button size="sm">Small</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                </Group>

                <Group>
                  <ActionIcon color={theme.primaryColor}>
                    <IconHeart size={16} />
                  </ActionIcon>
                  <ActionIcon variant="outline" color={theme.primaryColor}>
                    <IconStar size={16} />
                  </ActionIcon>
                  <ActionIcon variant="light" color={theme.primaryColor}>
                    <IconBell size={16} />
                  </ActionIcon>
                </Group>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="inputs" pt="md">
              <Stack gap="md">
                <Group grow>
                  <TextInput label="Text Input" placeholder="Enter text" radius={theme.defaultRadius} />
                  <TextInput
                    label="With Icon"
                    placeholder="Search..."
                    leftSection={<IconSearch size={16} />}
                    radius={theme.defaultRadius}
                  />
                </Group>

                <Group grow>
                  <Input.Wrapper label="Switch">
                    <Switch label="Enable notifications" color={theme.primaryColor} mt={5} />
                  </Input.Wrapper>
                  <Input.Wrapper label="Slider">
                    <Slider mt={5} defaultValue={40} color={theme.primaryColor} radius={theme.defaultRadius} />
                  </Input.Wrapper>
                </Group>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="data" pt="md">
              <Stack gap="md">
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>Role</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {tableData.map((row) => (
                      <Table.Tr key={row.id}>
                        <Table.Td>{row.name}</Table.Td>
                        <Table.Td>{row.email}</Table.Td>
                        <Table.Td>
                          <Badge
                            variant="light"
                            color={row.role === "Admin" ? "red" : row.role === "Moderator" ? "blue" : "gray"}
                          >
                            {row.role}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="feedback" pt="md">
              <Stack gap="md">
                <Progress value={65} color={theme.primaryColor} radius={theme.defaultRadius} striped animated />

                <Group>
                  <Badge variant="filled" color={theme.primaryColor}>
                    Filled
                  </Badge>
                  <Badge variant="light" color={theme.primaryColor}>
                    Light
                  </Badge>
                  <Badge variant="outline" color={theme.primaryColor}>
                    Outline
                  </Badge>
                  <Badge variant="dot" color={theme.primaryColor}>
                    Dot
                  </Badge>
                </Group>

                <Group>
                  <Tooltip label="Settings">
                    <ActionIcon variant="light">
                      <IconSettings size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="User Profile">
                    <ActionIcon variant="light">
                      <IconUser size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Card>

        {/* Typography Preview */}
        <Card withBorder p="md">
          <Title order={4} mb="md">
            Typography
          </Title>
          <Stack gap="sm">
            <Title order={1} style={{ fontFamily: theme.headings?.fontFamily || theme.fontFamily }}>
              Heading 1
            </Title>
            <Title order={2} style={{ fontFamily: theme.headings?.fontFamily || theme.fontFamily }}>
              Heading 2
            </Title>
            <Title order={3} style={{ fontFamily: theme.headings?.fontFamily || theme.fontFamily }}>
              Heading 3
            </Title>
            <Text size="lg">Large text with font family: {theme.fontFamily}</Text>
            <Text>Regular text that demonstrates the default font styling.</Text>
            <Text size="sm" c="dimmed">
              Small dimmed text for secondary information.
            </Text>
            <Text ff={theme.fontFamilyMonospace} size="sm">
              Monospace text: {theme.fontFamilyMonospace}
            </Text>
          </Stack>
        </Card>

        {/* Layout Preview */}
        <Card withBorder p="md">
          <Title order={4} mb="md">
            Layout & Spacing
          </Title>
          <Group gap="md">
            <Paper p="md" withBorder radius={theme.defaultRadius} style={{ flex: 1 }}>
              <Text fw={500}>Card with {theme.defaultRadius} radius</Text>
              <Text size="sm" c="dimmed">
                Scale factor: {theme.scale}
              </Text>
            </Paper>
            <Paper p="lg" shadow="md" radius={theme.defaultRadius} style={{ flex: 1 }}>
              <Text fw={500}>Card with shadow</Text>
              <Text size="sm" c="dimmed">
                Using theme colors and spacing
              </Text>
            </Paper>
          </Group>
        </Card>
      </Stack>
    </Paper>
  );
}
