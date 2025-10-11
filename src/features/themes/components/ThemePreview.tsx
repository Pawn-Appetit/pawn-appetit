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
import { useTranslation } from "react-i18next";
import type { Theme } from "../types/theme";

interface ThemePreviewProps {
  theme: Theme;
}

export default function ThemePreview({ theme }: ThemePreviewProps) {
  const { t } = useTranslation();
  // Sample data for preview
  const tableData = [
    { id: 1, name: t("themes.preview.demoUser1"), email: "john@example.com", role: t("themes.preview.admin") },
    { id: 2, name: t("themes.preview.demoUser2"), email: "jane@example.com", role: t("themes.preview.user") },
    { id: 3, name: t("themes.preview.demoUser3"), email: "bob@example.com", role: t("themes.preview.moderator") },
  ];

  return (
    <Paper p="xl" withBorder style={{ fontFamily: theme.fontFamily }}>
      <Stack gap="lg">
        <Group justify="space-between">
          <div>
            <Title order={2} style={{ fontFamily: theme.headings?.fontFamily || theme.fontFamily }}>
              {t("themes.preview.title")}
            </Title>
            <Text c="dimmed" size="sm">
              {theme.name} by {theme.author || t("themes.preview.unknown")}
            </Text>
          </div>
          <Group>
            <Badge variant="light" color={theme.primaryColor}>
              {theme.primaryColor}
            </Badge>
            <Badge variant="outline">{t("themes.preview.preview")}</Badge>
          </Group>
        </Group>

        {/* Color Palette Preview */}
        <Card withBorder p="md">
          <Title order={4} mb="sm">
            {t("themes.preview.colorPalette")}
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
            {t("themes.preview.componentExamples")}
          </Title>

          <Tabs defaultValue="buttons" variant="outline">
            <Tabs.List>
              <Tabs.Tab value="buttons">{t("themes.preview.buttons")}</Tabs.Tab>
              <Tabs.Tab value="inputs">{t("themes.preview.inputs")}</Tabs.Tab>
              <Tabs.Tab value="data">{t("themes.preview.data")}</Tabs.Tab>
              <Tabs.Tab value="feedback">{t("themes.preview.feedback")}</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="buttons" pt="md">
              <Stack gap="md">
                <Group>
                  <Button color={theme.primaryColor}>{t("themes.preview.primaryButton")}</Button>
                  <Button variant="outline" color={theme.primaryColor}>
                    {t("themes.preview.outline")}
                  </Button>
                  <Button variant="light" color={theme.primaryColor}>
                    {t("themes.preview.light")}
                  </Button>
                  <Button variant="subtle" color={theme.primaryColor}>
                    {t("themes.preview.subtle")}
                  </Button>
                </Group>

                <Group>
                  <Button size="xs">{t("themes.preview.extraSmall")}</Button>
                  <Button size="sm">{t("themes.preview.small")}</Button>
                  <Button size="md">{t("themes.preview.medium")}</Button>
                  <Button size="lg">{t("themes.preview.large")}</Button>
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
                  <TextInput
                    label={t("themes.preview.textInput")}
                    placeholder={t("themes.preview.enterText")}
                    radius={theme.defaultRadius}
                  />
                  <TextInput
                    label={t("themes.preview.withIcon")}
                    placeholder={t("themes.preview.searchPlaceholder")}
                    leftSection={<IconSearch size={16} />}
                    radius={theme.defaultRadius}
                  />
                </Group>

                <Group grow>
                  <Input.Wrapper label={t("themes.preview.switch")}>
                    <Switch label={t("themes.preview.enableNotifications")} color={theme.primaryColor} mt={5} />
                  </Input.Wrapper>
                  <Input.Wrapper label={t("themes.preview.slider")}>
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
                      <Table.Th>{t("themes.preview.name")}</Table.Th>
                      <Table.Th>{t("themes.preview.email")}</Table.Th>
                      <Table.Th>{t("themes.preview.role")}</Table.Th>
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
                            color={
                              row.role === t("themes.preview.admin")
                                ? "red"
                                : row.role === t("themes.preview.moderator")
                                  ? "blue"
                                  : "gray"
                            }
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
                    {t("themes.preview.filled")}
                  </Badge>
                  <Badge variant="light" color={theme.primaryColor}>
                    {t("themes.preview.light")}
                  </Badge>
                  <Badge variant="outline" color={theme.primaryColor}>
                    {t("themes.preview.outline")}
                  </Badge>
                  <Badge variant="dot" color={theme.primaryColor}>
                    {t("themes.preview.dot")}
                  </Badge>
                </Group>

                <Group>
                  <Tooltip label={t("themes.preview.settings")}>
                    <ActionIcon variant="light">
                      <IconSettings size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t("themes.preview.userProfile")}>
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
            {t("themes.preview.typography")}
          </Title>
          <Stack gap="sm">
            <Title order={1} style={{ fontFamily: theme.headings?.fontFamily || theme.fontFamily }}>
              {t("themes.preview.heading1")}
            </Title>
            <Title order={2} style={{ fontFamily: theme.headings?.fontFamily || theme.fontFamily }}>
              {t("themes.preview.heading2")}
            </Title>
            <Title order={3} style={{ fontFamily: theme.headings?.fontFamily || theme.fontFamily }}>
              {t("themes.preview.heading3")}
            </Title>
            <Text size="lg">{t("themes.preview.largeText", { fontFamily: theme.fontFamily })}</Text>
            <Text>{t("themes.preview.regularText")}</Text>
            <Text size="sm" c="dimmed">
              {t("themes.preview.smallDimmedText")}
            </Text>
            <Text ff={theme.fontFamilyMonospace} size="sm">
              {t("themes.preview.monospaceText", { fontFamily: theme.fontFamilyMonospace })}
            </Text>
          </Stack>
        </Card>

        {/* Layout Preview */}
        <Card withBorder p="md">
          <Title order={4} mb="md">
            {t("themes.preview.layoutSpacing")}
          </Title>
          <Group gap="md">
            <Paper p="md" withBorder radius={theme.defaultRadius} style={{ flex: 1 }}>
              <Text fw={500}>{t("themes.preview.cardWithRadius", { radius: theme.defaultRadius })}</Text>
              <Text size="sm" c="dimmed">
                {t("themes.preview.scaleFactor", { scale: theme.scale })}
              </Text>
            </Paper>
            <Paper p="lg" shadow="md" radius={theme.defaultRadius} style={{ flex: 1 }}>
              <Text fw={500}>{t("themes.preview.cardWithShadow")}</Text>
              <Text size="sm" c="dimmed">
                {t("themes.preview.usingThemeColors")}
              </Text>
            </Paper>
          </Group>
        </Card>
      </Stack>
    </Paper>
  );
}
