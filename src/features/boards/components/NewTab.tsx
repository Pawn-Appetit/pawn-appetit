import { Box, Button, Card, SimpleGrid, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconChess, IconFileImport, IconPuzzle } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import Chessboard from "@/components/icons/Chessboard";
import { tabsAtom } from "@/state/atoms";
import type { Tab } from "@/utils/tabs";

export default function NewTabHome({ id }: { id: string }) {
  const { t } = useTranslation();

  const [, setTabs] = useAtom(tabsAtom);

  const cards = [
    {
      icon: <IconChess size={60} />,
      title: t("features.tabs.playChess.title"),
      description: t("features.tabs.playChess.desc"),
      label: t("features.tabs.playChess.button"),
      onClick: () => {
        setTabs((prev: Tab[]) => {
          const tab = prev.find((t) => t.value === id);
          if (!tab) return prev;
          tab.name = "New Game";
          tab.type = "play";
          return [...prev];
        });
      },
    },
    {
      icon: <Chessboard size={60} />,
      title: t("features.tabs.analysisBoard.title"),
      description: t("features.tabs.analysisBoard.desc"),
      label: t("features.tabs.analysisBoard.button"),
      onClick: () => {
        setTabs((prev: Tab[]) => {
          const tab = prev.find((t) => t.value === id);
          if (!tab) return prev;
          tab.name = t("features.tabs.analysisBoard.title");
          tab.type = "analysis";
          return [...prev];
        });
      },
    },
    {
      icon: <IconPuzzle size={60} />,
      title: t("features.tabs.puzzle.title"),
      description: t("features.tabs.puzzle.desc"),
      label: t("features.tabs.puzzle.button"),
      onClick: () => {
        setTabs((prev) => {
          const tab = prev.find((t) => t.value === id);
          if (!tab) return prev;
          tab.name = t("features.tabs.puzzle.title");
          tab.type = "puzzles";
          return [...prev];
        });
      },
    },
    {
      icon: <IconFileImport size={60} />,
      title: t("features.tabs.importGame.title"),
      description: t("features.tabs.importGame.desc"),
      label: t("features.tabs.importGame.button"),
      onClick: () => {
        modals.openContextModal({
          modal: "importModal",
          innerProps: {},
        });
      },
    },
  ];

  return (
    <Stack gap="xl">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        {cards.map((card) => (
          <Card shadow="sm" p="lg" radius="md" withBorder key={card.title}>
            <Stack align="center" h="100%" justify="space-between">
              {card.icon}

              <Box style={{ textAlign: "center" }}>
                <Text fw={500}>{card.title}</Text>
                <Text size="sm" c="dimmed">
                  {card.description}
                </Text>
              </Box>

              <Button variant="light" fullWidth mt="md" radius="md" onClick={card.onClick}>
                {card.label}
              </Button>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
