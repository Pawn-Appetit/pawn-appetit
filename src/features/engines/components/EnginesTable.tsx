import { Badge, Group, Table, Text } from "@mantine/core";
import { IconCloud, IconCpu } from "@tabler/icons-react";
import LocalImage from "@/components/LocalImage";
import type { Engine } from "@/utils/engines";

interface EnginesTableProps {
  engines: Engine[];
  filteredIndices: number[];
  selected: number | undefined;
  setSelected: (v: number | null) => void;
}

export function EnginesTable({ engines, filteredIndices, selected, setSelected }: EnginesTableProps) {
  return (
    <Table highlightOnHover striped>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          <Table.Th>Type</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th>ELO</Table.Th>
          <Table.Th>Version</Table.Th>
          <Table.Th>Path/URL</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {filteredIndices.map((i: number) => {
          const engine = engines[i];
          const isLocal = engine.type === "local";
          return (
            <Table.Tr
              key={`${engine.name}-${i}`}
              onClick={() => setSelected(i)}
              style={{ cursor: "pointer" }}
              bg={selected === i ? "var(--mantine-color-blue-light)" : undefined}
            >
              <Table.Td>
                <Group gap="xs">
                  {engine.image ? (
                    <LocalImage src={engine.image} alt={engine.name} h={32} w={32} />
                  ) : isLocal ? (
                    <IconCpu size={32} />
                  ) : (
                    <IconCloud size={32} />
                  )}
                  <Text fw={500}>{engine.name}</Text>
                </Group>
              </Table.Td>
              <Table.Td>
                <Badge size="sm" variant="light" color={isLocal ? "blue" : "grape"}>
                  {isLocal ? "Local" : "Cloud"}
                </Badge>
              </Table.Td>
              <Table.Td>
                {engine.loaded ? (
                  <Badge size="sm" variant="outline" color="green">
                    Enabled
                  </Badge>
                ) : (
                  <Badge size="sm" variant="outline" color="gray">
                    Disabled
                  </Badge>
                )}
              </Table.Td>
              <Table.Td>{isLocal && engine.elo ? engine.elo : "—"}</Table.Td>
              <Table.Td>{isLocal && engine.version ? engine.version : "—"}</Table.Td>
              <Table.Td>
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {isLocal ? engine.path.split(/\/|\\/).slice(-1)[0] : engine.url}
                </Text>
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
