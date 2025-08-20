import { Box, Button, Card, SimpleGrid, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconChess, IconFileImport, IconPuzzle } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import Chessboard from "@/common/components/icons/Chessboard";
import { tabsAtom } from "@/state/atoms";
import type { Tab } from "@/utils/tabs";

export default function NewTabHome({ id }: { id: string }) {
  const { t } = useTranslation();

  const [, setTabs] = useAtom(tabsAtom);

  const cards = [
    {
      icon: <IconChess size={60} />,
      title: t("Tab.PlayChess.Title"),
      description: t("Tab.PlayChess.Desc"),
      label: t("Tab.PlayChess.Button"),
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
      title: t("Tab.AnalysisBoard.Title"),
      description: t("Tab.AnalysisBoard.Desc"),
      label: t("Tab.AnalysisBoard.Button"),
      onClick: () => {
        setTabs((prev: Tab[]) => {
          const tab = prev.find((t) => t.value === id);
          if (!tab) return prev;
          tab.name = t("Tab.AnalysisBoard.Title");
          tab.type = "analysis";
          return [...prev];
        });
      },
    },
    {
      icon: <IconPuzzle size={60} />,
      title: t("Tab.Puzzle.Title"),
      description: t("Tab.Puzzle.Desc"),
      label: t("Tab.Puzzle.Button"),
      onClick: () => {
        setTabs((prev) => {
          const tab = prev.find((t) => t.value === id);
          if (!tab) return prev;
          tab.name = t("Tab.Puzzle.Title");
          tab.type = "puzzles";
          return [...prev];
        });
      },
    },
    {
      icon: <IconFileImport size={60} />,
      title: t("Tab.ImportGame.Title"),
      description: t("Tab.ImportGame.Desc"),
      label: t("Tab.ImportGame.Button"),
      onClick: () => {
        modals.openContextModal({
          modal: "importModal",
          innerProps: {},
        });
      },
    },
  ];

  return (
    <Stack gap="xl" mt="md">
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
