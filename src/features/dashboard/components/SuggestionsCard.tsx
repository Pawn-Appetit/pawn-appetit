import { Badge, Button, Card, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconArrowRight, IconBook2, IconBrain, IconTrophy } from "@tabler/icons-react";

export type Suggestion = {
  id: string;
  title: string;
  tag: "Practice" | "Openings" | "Endgames" | "Tactics";
  difficulty: string;
  to?: string;
  onClick?: () => void;
};

interface SuggestionsCardProps {
  suggestions: Suggestion[];
  onSuggestionClick: (suggestion: Suggestion) => void;
}

export function SuggestionsCard({ suggestions, onSuggestionClick }: SuggestionsCardProps) {
  return (
    <Card withBorder p="lg" radius="md" h="100%">
      <Group justify="space-between" mb="sm">
        <Text fw={700}>Suggested for you</Text>
        <Group gap="xs">
          <Badge variant="light" color="teal">
            Practice
          </Badge>
          <Badge variant="light" color="blue">
            Openings
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
                  <Badge variant="light">{s.tag}</Badge>
                  <Badge variant="dot" color="gray">
                    {s.difficulty}
                  </Badge>
                </Group>
              </Stack>
            </Group>
            <Button variant="light" onClick={() => onSuggestionClick(s)} rightSection={<IconArrowRight size={16} />}>
              Start
            </Button>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}
