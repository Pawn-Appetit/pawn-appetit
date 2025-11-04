import { Alert, Drawer, Group, ScrollArea, SimpleGrid, Stack, Title } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import GenericCard from "@/components/GenericCard";
import OpenFolderButton from "@/components/OpenFolderButton";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { Route } from "@/routes/engines";
import { enginesAtom } from "@/state/atoms";
import AddEngine from "./components/AddEngine";
import { CloudEngineSettings } from "./components/CloudEngineSettings";
import { EngineCard } from "./components/EngineCard";
import { EngineSettings } from "./components/EngineSettings";
import { EnginesTable } from "./components/EnginesTable";
import { EngineToolbar } from "./components/EngineToolbar";
import { useEngineFiltering } from "./hooks/useEngineFiltering";

export default function EnginesPage() {
  const { t } = useTranslation();
  const { layout } = useResponsiveLayout();

  const [engines] = useAtom(enginesAtom);
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(query, 300);
  const [sortBy, setSortBy] = useState<"name" | "elo">("name");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const { selected } = Route.useSearch();
  const navigate = useNavigate();

  const isMobile = layout.engines.layoutType === "mobile";
  const gridCols = isMobile ? 1 : { base: 1, md: 4 };
  const setSelected = (v: number | null) => {
    // @ts-expect-error
    navigate({ search: { selected: v ?? undefined } });
  };

  const selectedEngine = selected !== undefined ? engines[selected] : null;

  const filteredIndices = useEngineFiltering(engines, debouncedQuery, sortBy);

  return (
    <>
      <Group align="center" p="md">
        <Title>{t("features.engines.title")}</Title>
        <OpenFolderButton base="AppDir" folder="engines" />
      </Group>
      <Stack px="md" pb="md">
        <EngineToolbar
          query={query}
          setQuery={setQuery}
          sortBy={sortBy}
          setSortBy={setSortBy}
          viewMode={viewMode}
          setViewMode={setViewMode}
          onAddNew={() => setOpened(true)}
        />
        <ScrollArea h="calc(100vh - 190px)" offsetScrollbars aria-live="polite">
          {filteredIndices.length === 0 ? (
            <Alert title={t("features.engines.noEnginesFound")} color="gray" variant="light">
              {t("features.engines.noEnginesFoundMessage")}
            </Alert>
          ) : viewMode === "grid" ? (
            <SimpleGrid cols={gridCols} spacing={{ base: "md", md: "sm" }}>
              {filteredIndices.map((i: number) => {
                const item = engines[i];
                const stats =
                  item.type === "local"
                    ? [
                        {
                          label: "ELO",
                          value: item.elo ? item.elo.toString() : "??",
                        },
                      ]
                    : [{ label: "Type", value: "Cloud" }];
                if (item.type === "local" && item.version) {
                  stats.push({
                    label: t("common.version"),
                    value: item.version,
                  });
                }
                return (
                  <GenericCard
                    id={i}
                    key={`${item.name}-${i}`}
                    isSelected={selected === i}
                    setSelected={setSelected}
                    error={undefined}
                    content={<EngineCard engine={item} stats={stats} />}
                  />
                );
              })}
            </SimpleGrid>
          ) : (
            <EnginesTable
              engines={engines}
              filteredIndices={filteredIndices}
              selected={selected}
              setSelected={setSelected}
            />
          )}
        </ScrollArea>
      </Stack>
      <Drawer
        opened={selected !== undefined && selectedEngine !== null}
        onClose={() => setSelected(null)}
        position="right"
        size={isMobile ? "100%" : "xl"}
        title={selectedEngine ? selectedEngine.name : ""}
        overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
      >
        {selectedEngine &&
          selected !== undefined &&
          (selectedEngine.type === "local" ? (
            <EngineSettings selected={selected} setSelected={setSelected} isMobile={isMobile} />
          ) : (
            <CloudEngineSettings selectedEngine={selectedEngine} selected={selected} setSelected={setSelected} />
          ))}
      </Drawer>
      <AddEngine opened={opened} setOpened={setOpened} />
    </>
  );
}
