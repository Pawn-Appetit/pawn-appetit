import type { MantineColor } from "@mantine/core";
import { Button, Card, Group, SimpleGrid, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";

interface QuickAction {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  color: MantineColor;
}

interface QuickActionsGridProps {
  actions: QuickAction[];
}

export function QuickActionsGrid({ actions }: QuickActionsGridProps) {
  return (
    <Card withBorder p="lg" radius="md" h="100%">
      <SimpleGrid cols={{ base: 1, xs: 2, sm: 2, md: 2, lg: 4, xl: 4 }}>
        {actions.map((qa) => (
          <Card key={qa.title} withBorder radius="md" p="md">
            <Stack gap={8} align="flex-start">
              <Group>
                <ThemeIcon variant="light" color={qa.color} size={42} radius="md">
                  {qa.icon}
                </ThemeIcon>
                <Text fw={600}>{qa.title}</Text>
              </Group>
              <Text size="sm" c="dimmed">
                {qa.description}
              </Text>
              <Button variant="light" rightSection={<IconArrowRight size={16} />} onClick={qa.onClick}>
                Open
              </Button>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Card>
  );
}
