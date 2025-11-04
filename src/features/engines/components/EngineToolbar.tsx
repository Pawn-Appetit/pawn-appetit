import { Button, Center, Group, SegmentedControl, TextInput } from "@mantine/core";
import {
  IconArrowsSort,
  IconGrid3x3,
  IconList,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

interface EngineToolbarProps {
  query: string;
  setQuery: (query: string) => void;
  sortBy: "name" | "elo";
  setSortBy: (sortBy: "name" | "elo") => void;
  viewMode: "grid" | "table";
  setViewMode: (viewMode: "grid" | "table") => void;
  onAddNew: () => void;
}

export function EngineToolbar({
  query,
  setQuery,
  sortBy,
  setSortBy,
  viewMode,
  setViewMode,
  onAddNew,
}: EngineToolbarProps) {
  const { t } = useTranslation();

  return (
    <Group wrap="wrap" gap="xs" justify="space-between">
      <Group>
        <TextInput
          aria-label={t("features.engines.searchPlaceholder")}
          placeholder={t("features.engines.searchPlaceholder")}
          leftSection={<IconSearch size="1rem" />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          w={{ base: "100%", sm: 260 }}
        />
        <Button
          variant="default"
          leftSection={<IconArrowsSort size="1rem" />}
          onClick={() => setSortBy(sortBy === "name" ? "elo" : "name")}
          aria-label={`Sort by ${sortBy === "name" ? "elo" : "name"}`}
        >
          Sort: {sortBy === "name" ? "Name" : "ELO"}
        </Button>
        <SegmentedControl
          value={viewMode}
          onChange={(v) => setViewMode(v as "grid" | "table")}
          data={[
            {
              value: "grid",
              label: (
                <Center style={{ gap: 10 }}>
                  <IconGrid3x3 size="1rem" />
                  <span>Grid</span>
                </Center>
              ),
            },
            {
              value: "table",
              label: (
                <Center style={{ gap: 10 }}>
                  <IconList size="1rem" />
                  <span>Table</span>
                </Center>
              ),
            },
          ]}
        />
      </Group>
      <Button size="xs" leftSection={<IconPlus size="1rem" />} onClick={onAddNew} mr="sm">
        {t("common.addNew")}
      </Button>
    </Group>
  );
}
