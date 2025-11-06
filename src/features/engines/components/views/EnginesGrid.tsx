import { SimpleGrid, Skeleton, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import GenericCard from "@/components/GenericCard";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import type { Engine } from "@/utils/engines";
import { EngineCard } from "../EngineCard";

interface EnginesGridProps {
  engines: Engine[];
  filteredIndices: number[];
  selected: number | undefined;
  setSelected: (v: number | null) => void;
  isLoading?: boolean;
}

export function EnginesGrid({ engines, filteredIndices, selected, setSelected, isLoading }: EnginesGridProps) {
  const { t } = useTranslation();
  const { layout } = useResponsiveLayout();

  const isMobile = layout.engines.layoutType === "mobile";
  const gridCols = isMobile ? 1 : { base: 1, md: 4 };

  if (isLoading) {
    if (isMobile) {
      return (
        <Stack gap="md">
          <Skeleton h="8rem" />
          <Skeleton h="8rem" />
          <Skeleton h="8rem" />
        </Stack>
      );
    }

    return (
      <SimpleGrid cols={gridCols} spacing={{ base: "md", md: "sm" }}>
        <Skeleton h="8rem" />
        <Skeleton h="8rem" />
        <Skeleton h="8rem" />
        <Skeleton h="8rem" />
      </SimpleGrid>
    );
  }

  return (
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
  );
}
