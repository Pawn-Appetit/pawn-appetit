import { ActionIcon, Badge, Box, Flex, Paper, Select, Tabs, Text, Tooltip } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import type { PlayerGameInfo } from "@/bindings";
import { DatabaseViewStateContext } from "@/features/databases/components/DatabaseViewStateContext";
import FideInfo from "@/features/databases/components/drawers/FideInfo";
import { sessionsAtom } from "@/state/atoms";
import type { DatabaseViewStore } from "@/state/store/database";
import { analyzePlayerStyle } from "@/utils/playerStyle";
import OpeningsPanel from "./PersonalCardPanels/OpeningsPanel";
import OverviewPanel from "./PersonalCardPanels/OverviewPanel";
import RatingsPanel from "./PersonalCardPanels/RatingsPanel";

function PersonalPlayerCard({
  name,
  setName,
  info,
}: {
  name: string;
  setName?: (name: string) => void;
  info: PlayerGameInfo;
}) {
  const { t } = useTranslation();
  const store = useContext(DatabaseViewStateContext)!;
  const activeTab = useStore(store, (s) => s?.players?.activeTab);
  const setActiveTab = useStore(store, (s) => s.setPlayersActiveTab);

  const [opened, setOpened] = useState(false);
  const sessions = useAtomValue(sessionsAtom);
  const players = Array.from(
    new Set(sessions.map((s) => s.player || s.lichess?.username || s.chessCom?.username || "")),
  );

  // Analyze player style from openings
  const playerStyle = useMemo(() => analyzePlayerStyle(info), [info]);

  return (
    <Paper
      h="100%"
      shadow="sm"
      p="md"
      withBorder
      style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      <FideInfo key={name} opened={opened} setOpened={setOpened} name={name} />
      <Box pos="relative">
        {name !== "Stats" && (
          <Tooltip label={t("accounts.personalCard.fideInfo")}>
            <ActionIcon pos="absolute" right={0} onClick={() => setOpened(true)}>
              <IconInfoCircle />
            </ActionIcon>
          </Tooltip>
        )}
        {setName ? (
          <Flex justify="center" direction="column" gap="xs">
            <Select
              value={name}
              data={players}
              onChange={(e) => setName(e || "")}
              clearable={false}
              fw="bold"
              styles={{
                input: {
                  textAlign: "center",
                  fontSize: "1.25rem",
                },
              }}
            />
            <Flex direction="column" gap={4} align="center">
              <Badge color={playerStyle.color} variant="light" size="lg">
                {t(playerStyle.label)}
              </Badge>
              <Text fz="xs" c="dimmed" ta="center" style={{ maxWidth: "320px", lineHeight: 1.4 }}>
                {t(playerStyle.description)}
              </Text>
            </Flex>
          </Flex>
        ) : (
          <Flex direction="column" gap="xs" align="center">
            <Text fz="lg" fw={500} ta="center">
              {name}
            </Text>
            <Flex direction="column" gap={4} align="center">
              <Badge color={playerStyle.color} variant="light" size="lg">
                {t(playerStyle.label)}
              </Badge>
              <Text fz="xs" c="dimmed" ta="center" style={{ maxWidth: "320px", lineHeight: 1.4 }}>
                {t(playerStyle.description)}
              </Text>
            </Flex>
          </Flex>
        )}
      </Box>
      <Tabs
        mt="xs"
        keepMounted={false}
        value={activeTab}
        onChange={(v) => setActiveTab(v as DatabaseViewStore["players"]["activeTab"])}
        variant="outline"
        flex={1}
        style={{
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="overview">{t("accounts.personalCard.tabs.overview")}</Tabs.Tab>
          <Tabs.Tab value="ratings">{t("accounts.personalCard.tabs.ratings")}</Tabs.Tab>
          <Tabs.Tab value="openings">{t("accounts.personalCard.tabs.openings")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="overview">
          <OverviewPanel playerName={name} info={info} />
        </Tabs.Panel>
        <Tabs.Panel value="openings" style={{ overflow: "hidden" }}>
          <OpeningsPanel playerName={name} info={info} />
        </Tabs.Panel>
        <Tabs.Panel value="ratings">
          <RatingsPanel playerName={name} info={info} />
        </Tabs.Panel>
      </Tabs>
    </Paper>
  );
}

export default PersonalPlayerCard;
