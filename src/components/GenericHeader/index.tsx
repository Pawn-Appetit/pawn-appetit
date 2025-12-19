import { Button, Group, Select, Stack, TextInput, Title } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import {
  IconArrowsSort,
  IconLayoutGrid,
  IconList,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import OpenFolderButton from "../OpenFolderButton";

export type SortOption = {
  value: string;
  label: string;
};

export type SortState = {
  field: string;
  direction: "asc" | "desc";
};

type ViewMode = "grid" | "table";

type GenericHeaderProps = {
  title: string;
  folder?: string;
  searchPlaceholder?: string;
  query?: string;
  setQuery?: (query: string) => void;
  sortOptions?: SortOption[];
  currentSort?: SortState;
  onSortChange?: (sort: SortState) => void;
  viewMode?: ViewMode;
  setViewMode?: (viewMode: ViewMode) => void;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  showViewToggle?: boolean;
  pageKey?: string; // Unique key for localStorage per page
};

export default function GenericHeader({
  title,
  folder,
  searchPlaceholder,
  query,
  setQuery,
  sortOptions,
  currentSort: externalSort,
  onSortChange: externalSortChange,
  viewMode: externalViewMode,
  setViewMode: externalSetViewMode,
  filters,
  actions,
  showViewToggle = true,
  pageKey,
}: GenericHeaderProps) {
  const { t } = useTranslation();

  const [storedSort, setStoredSort] = useLocalStorage<SortState | undefined>({
    key: pageKey ? `${pageKey}-sort` : "generic-sort",
    defaultValue: externalSort,
  });

  const [storedViewMode, setStoredViewMode] = useLocalStorage<ViewMode>({
    key: pageKey ? `${pageKey}-view` : "generic-view",
    defaultValue: externalViewMode || "grid",
  });

  const currentSort = pageKey ? storedSort : externalSort;
  const viewMode = pageKey ? storedViewMode : externalViewMode;

  const onSortChange = (sort: SortState) => {
    if (pageKey) {
      setStoredSort(sort);
    }
    externalSortChange?.(sort);
  };

  const setViewMode = (mode: ViewMode) => {
    if (pageKey) {
      setStoredViewMode(mode);
    }
    externalSetViewMode?.(mode);
  };

  useEffect(() => {
    if (pageKey && externalSort) {
      setStoredSort(externalSort);
    }
  }, [pageKey, externalSort, setStoredSort]);

  useEffect(() => {
    if (pageKey && externalViewMode) {
      setStoredViewMode(externalViewMode);
    }
  }, [pageKey, externalViewMode, setStoredViewMode]);

  const toggleSortDirection = () => {
    if (!currentSort || !onSortChange) return;
    onSortChange({
      ...currentSort,
      direction: currentSort.direction === "asc" ? "desc" : "asc",
    });
  };

  const directionIcon =
    currentSort?.direction === "asc" ? <IconSortAscending size="1rem" /> : <IconSortDescending size="1rem" />;

  const viewModeOptions = [
    {
      value: "grid",
      label: `${t("common.grid", "Grid")}`,
    },
    {
      value: "table",
      label: `${t("common.table", "Table")}`,
    },
  ];

  return (
    <Stack gap="0">
      <Group align="center" p="md" wrap="nowrap">
        <Title order={2} style={{ flexShrink: 0 }}>
          {title}
        </Title>
        {folder && <OpenFolderButton base="AppDir" folder={folder} />}
      </Group>
      <Group wrap="wrap" gap="xs" justify="space-between" px="md" pb="md">
        {searchPlaceholder && (
          <Group wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
            <TextInput
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              leftSection={<IconSearch size="1rem" />}
              value={query}
              onChange={(e) => setQuery?.(e.currentTarget.value)}
              style={{ flex: 1, minWidth: 250, maxWidth: 250 }}
              size="xs"
            />
            {filters}
          </Group>
        )}
        <Group wrap="nowrap" gap="xs">
          {actions}
          {sortOptions && sortOptions.length > 0 && currentSort && (
            <Button.Group>
              <Select
                data={sortOptions}
                value={currentSort.field}
                onChange={(value) => {
                  if (value && onSortChange) {
                    onSortChange({ field: value, direction: currentSort.direction });
                  }
                }}
                leftSection={<IconArrowsSort size="1rem" />}
                aria-label={t("common.sort", "Sort")}
                w="120px"
                styles={{ input: { borderTopRightRadius: "0", borderBottomRightRadius: "0" } }}
                size="xs"
              />
              <Button
                variant="default"
                onClick={toggleSortDirection}
                aria-label={t("common.sortDirection", "Sort Direction")}
                style={{ flexShrink: 0 }}
                px="xs"
                size="xs"
              >
                {directionIcon}
              </Button>
            </Button.Group>
          )}
          {showViewToggle && viewMode && setViewMode && (
            <Select
              data={viewModeOptions}
              value={viewMode}
              onChange={(value) => {
                if (value) {
                  setViewMode(value as ViewMode);
                }
              }}
              leftSection={viewMode === "grid" ? <IconLayoutGrid size="1rem" /> : <IconList size="1rem" />}
              aria-label={t("common.view", "View")}
              w="110px"
              size="xs"
            />
          )}
        </Group>
      </Group>
    </Stack>
  );
}
