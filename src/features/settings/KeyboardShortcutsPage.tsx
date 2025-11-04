import { ActionIcon, Box, Group, ScrollArea, Stack, Table, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { IconReload } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { RESET } from "jotai/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { keyMapAtom } from "@/state/keybindings";
import KeybindInput from "./components/KeybindInput";
import * as classes from "./SettingsPage.css";

export default function KeyboardShortcutsPage() {
  const { t } = useTranslation();
  const [keyMap, setKeyMap] = useAtom(keyMapAtom);
  const [search, setSearch] = useState("");

  return (
    <Box h="100%" style={{ overflow: "hidden" }}>
      <Stack p="md" gap="0">
        <Group>
          <Title order={1} fw={500} className={classes.title}>
            {t("settings.keybindings.title")}
          </Title>
          <Tooltip label="Reset">
            <ActionIcon onClick={() => setKeyMap(RESET)}>
              <IconReload size="1rem" />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Text size="xs" c="dimmed" mt={3} mb="lg">
          {t("settings.keybindings.desc")}
        </Text>
      </Stack>
      <Stack px="md" pb="md" gap="0">
        <TextInput
          placeholder={t("settings.keybindings.placeholder")}
          size="xs"
          mb="lg"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <ScrollArea h="calc(100vh - 200px)" pr="lg">
          <Table stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("settings.keybindings.command")}</Table.Th>
                <Table.Th>{t("settings.keybindings.keybinding")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {Object.entries(keyMap)
                .filter(([_, keybind]) => keybind.name.toLowerCase().includes(search.toLowerCase()))
                .map(([action, keybind]) => {
                  return (
                    <Table.Tr key={keybind.name}>
                      <Table.Td>{t(keybind.name)}</Table.Td>
                      <Table.Td>
                        <KeybindInput action={action} keybind={keybind} />
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Stack>
    </Box>
  );
}
