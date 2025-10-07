import { ActionIcon, Box, Group, ScrollArea, Table, Text, TextInput, Title, Tooltip } from "@mantine/core";
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
    <Box p="lg" h="100%" style={{ overflow: "hidden" }}>
      <Group>
        <Title order={1} fw={500} className={classes.title}>
          Keybindings
        </Title>
        <Tooltip label="Reset">
          <ActionIcon onClick={() => setKeyMap(RESET)}>
            <IconReload size="1rem" />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Text size="xs" c="dimmed" mt={3} mb="lg">
        Customize keyboard shortcuts
      </Text>
      <TextInput
        placeholder="Type to search in keybindings"
        size="xs"
        mb="lg"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />
      <ScrollArea h="calc(100vh - 200px)" pr="lg">
        <Table stickyHeader>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Command</Table.Th>
              <Table.Th>Keybinding</Table.Th>
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
    </Box>
  );
}
