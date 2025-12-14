import { Badge, Button, Card, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconArrowRight, IconBook2, IconBrain, IconTrophy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

export type Suggestion = {
  id: string;
  title: string;
  tag: "Lessons" | "Openings" | "Endgames" | "Tactics";
  difficulty: string;
  to?: string;
  onClick?: () => void;
};

interface SuggestionsCardProps {
  suggestions: Suggestion[];
  onSuggestionClick: (suggestion: Suggestion) => void;
}

export function SuggestionsCard({ suggestions, onSuggestionClick }: SuggestionsCardProps) {
  const { t } = useTranslation();

  const getTagTranslation = (tag: string) => {
    const tagMap: Record<string, string> = {
      Lessons: t("features.dashboard.tags.lessons"),
      Openings: t("features.dashboard.tags.openings"),
      Endgames: t("features.dashboard.tags.endgames"),
      Tactics: t("features.dashboard.tags.tactics"),
    };
    return tagMap[tag] || tag;
  };

  return (
    <Card withBorder p="lg" radius="md" h="100%">
      <Group justify="space-between" mb="sm">
        <Text fw={700}>{t("features.dashboard.suggestedForYou")}</Text>
        <Group gap="xs">
          <Badge variant="light" color="grape">
            {t("features.dashboard.tags.lessons")}
          </Badge>
          <Badge variant="light" color="blue">
            {t("features.dashboard.tags.openings")}
          </Badge>
        </Group>
      </Group>
      <Stack>
        {suggestions.map((s) => (
          <Group key={s.id} justify="space-between" align="center">
            <Group>
              <ThemeIcon
                variant="light"
                color={s.tag === "Openings" ? "blue" : s.tag === "Endgames" ? "grape" : "teal"}
              >
                {s.tag === "Openings" ? (
                  <IconBook2 size={16} />
                ) : s.tag === "Endgames" ? (
                  <IconBrain size={16} />
                ) : (
                  <IconTrophy size={16} />
                )}
              </ThemeIcon>
              <Stack gap={0}>
                <Text fw={600}>{s.title}</Text>
                <Group gap={6}>
                  <Badge variant="light">{getTagTranslation(s.tag)}</Badge>
                  <Badge variant="dot" color="gray">
                    {s.difficulty}
                  </Badge>
                </Group>
              </Stack>
            </Group>
            <Button variant="light" onClick={() => onSuggestionClick(s)} rightSection={<IconArrowRight size={16} />}>
              {t("features.dashboard.start")}
            </Button>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}
