import { ActionIcon, Box, Group, Stack, Tabs, Title } from "@mantine/core";
import { IconArrowBackUp, IconChess, IconTrophy, IconUser } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import GameTable from "@/features/databases/components/GameTable";
import PlayerTable from "@/features/databases/components/PlayerTable";
import { activeDatabaseViewStore, type DatabaseViewStore, useActiveDatabaseViewStore } from "@/state/store/database";
import { DatabaseViewStateContext } from "./components/DatabaseViewStateContext";
import TournamentTable from "./components/TournamentTable";

function DatabaseView() {
  const database = useActiveDatabaseViewStore((s) => s.database);
  const databaseTitle = useActiveDatabaseViewStore((s) => s.database?.title)!;
  const mode = useActiveDatabaseViewStore((s) => s.activeTab);
  const clearDatabase = useActiveDatabaseViewStore((s) => s.clearDatabase);
  const setActiveTab = useActiveDatabaseViewStore((s) => s.setActiveTab);
  const { t } = useTranslation();

  return (
    <Box p="sm" h="100%">
      {database && (
        <DatabaseViewStateContext.Provider value={activeDatabaseViewStore}>
          <Stack h="100%" style={{ overflow: "hidden" }}>
            <Group align="center">
              <Link onClick={() => clearDatabase()} to={"/databases"}>
                <ActionIcon variant="default">
                  <IconArrowBackUp size="1rem" />
                </ActionIcon>
              </Link>
              <Title>{databaseTitle}</Title>
            </Group>
            <Tabs
              value={mode}
              onChange={(value) => setActiveTab((value ?? "games") as DatabaseViewStore["activeTab"])}
              flex={1}
              style={{
                display: "flex",
                overflow: "hidden",
                flexDirection: "column",
              }}
            >
              <Tabs.List>
                <Tabs.Tab leftSection={<IconChess size="1rem" />} value="games">
                  {t("features.databases.card.games")}
                </Tabs.Tab>
                <Tabs.Tab leftSection={<IconUser size="1rem" />} value="players">
                  {t("features.databases.card.players")}
                </Tabs.Tab>
                <Tabs.Tab leftSection={<IconTrophy size="1rem" />} value="tournaments">
                  {t("features.databases.card.tournaments")}
                </Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="games" flex={1} style={{ overflow: "hidden" }} pt="md">
                <GameTable />
              </Tabs.Panel>
              <Tabs.Panel value="players" flex={1} style={{ overflow: "hidden" }} pt="md">
                <PlayerTable />
              </Tabs.Panel>
              <Tabs.Panel value="tournaments" flex={1} style={{ overflow: "hidden" }} pt="md">
                <TournamentTable />
              </Tabs.Panel>
            </Tabs>
          </Stack>
        </DatabaseViewStateContext.Provider>
      )}
    </Box>
  );
}

export default DatabaseView;
