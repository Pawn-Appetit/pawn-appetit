import { ActionIcon, Divider, Group, Paper, ScrollArea, Stack, Tooltip } from "@mantine/core";
import { IconTrash, IconZoomCheck } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { commands, type NormalizedGame } from "@/bindings";
import CollapsibleGameInfo from "@/components/CollapsibleGameInfo";
import { TreeStateProvider } from "@/components/TreeStateContext";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { createTab } from "@/utils/tabs";
import GamePreview from "./GamePreview";

function GameCard({ game, file, mutate }: { game: NormalizedGame; file: string; mutate: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { layout } = useResponsiveLayout();

  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);

  // Determine spacing and sizing based on responsive configuration
  const getSpacing = () => {
    switch (layout.databases.density) {
      case "compact":
        return "xs";
      case "normal":
        return "sm";
      case "comfortable":
        return "md";
      default:
        return "sm";
    }
  };

  const getContentDensity = () => {
    switch (layout.databases.density) {
      case "compact":
        return { padding: "xs", gap: "xs" };
      case "normal":
        return { padding: "sm", gap: "sm" };
      case "comfortable":
        return { padding: "md", gap: "md" };
      default:
        return { padding: "sm", gap: "sm" };
    }
  };

  const spacing = getSpacing();
  const density = getContentDensity();

  return (
    <Paper shadow="sm" p={density.padding} withBorder h="100%">
      <ScrollArea h="100%">
        <Stack h="100%" gap={density.gap}>
          <TreeStateProvider>
            <CollapsibleGameInfo headers={game} defaultCollapsed={layout.gameInfoCollapsedByDefault} />
          </TreeStateProvider>
          <Divider />
          <Group justify="left" gap={spacing}>
            <Tooltip label={t("databases.analyzeGame")}>
              <ActionIcon
                variant="subtle"
                size={layout.databases.density === "compact" ? "lg" : "md"}
                onClick={() => {
                  createTab({
                    tab: {
                      name: `${game.white} - ${game.black}`,
                      type: "analysis",
                    },
                    setTabs,
                    setActiveTab,
                    pgn: game.moves,
                    headers: game,
                    srcInfo: {
                      type: "db",
                      db: file,
                      id: game.id,
                    },
                  });
                  navigate({ to: "/boards" });
                }}
              >
                <IconZoomCheck size={layout.databases.density === "compact" ? "1.4rem" : "1.2rem"} stroke={1.5} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label={t("databases.deleteGame")}>
              <ActionIcon
                variant="subtle"
                color="red"
                size={layout.databases.density === "compact" ? "lg" : "md"}
                onClick={() => {
                  commands.deleteDbGame(file, game.id).then(() => mutate());
                }}
              >
                <IconTrash size={layout.databases.density === "compact" ? "1.4rem" : "1.2rem"} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Divider />
          <GamePreview pgn={game.moves} headers={game} showOpening />
        </Stack>
      </ScrollArea>
    </Paper>
  );
}

export default GameCard;
