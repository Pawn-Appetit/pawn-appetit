import { Badge, Box, Card, Divider, Group, Stack, Text } from "@mantine/core";

interface RatingHistory {
  classical?: number;
  rapid?: number;
  blitz?: number;
  bullet?: number;
}

interface UserProfileCardProps {
  name: string;
  handle: string;
  title: string;
  ratingHistory: RatingHistory;
}

export function UserProfileCard({ name, handle, title, ratingHistory }: UserProfileCardProps) {
  return (
    <Card withBorder p="lg" radius="md" h="100%">
      <Box>
        <Group gap={6} justify="space-between">
          <Text fw={700}>{name}</Text>
          <Badge color="yellow" variant="light">
            {title}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          {handle}
        </Text>
      </Box>
      <Divider my="md" />
      <Group justify="space-between" align="stretch">
        {ratingHistory.classical && (
          <Stack gap={2} p={{ base: "xs", sm: "md" }} style={{ flex: 1 }}>
            <Text size="xs" c="teal.6">
              Classical
            </Text>
            <Text fw={700} fz={{ base: "lg", sm: "xl" }}>
              {ratingHistory.classical}
            </Text>
          </Stack>
        )}
        {ratingHistory.rapid && (
          <Stack gap={2} p={{ base: "xs", sm: "md" }} style={{ flex: 1 }}>
            <Text size="xs" c="teal.6">
              Rapid
            </Text>
            <Text fw={700} fz={{ base: "lg", sm: "xl" }}>
              {ratingHistory.rapid}
            </Text>
          </Stack>
        )}
        {ratingHistory.blitz && (
          <Stack gap={2} p={{ base: "xs", sm: "md" }} style={{ flex: 1 }}>
            <Text size="xs" c="yellow.6">
              Blitz
            </Text>
            <Text fw={700} fz={{ base: "lg", sm: "xl" }}>
              {ratingHistory.blitz}
            </Text>
          </Stack>
        )}
        {ratingHistory.bullet && (
          <Stack gap={2} p={{ base: "xs", sm: "md" }} style={{ flex: 1 }}>
            <Text size="xs" c="blue.6">
              Bullet
            </Text>
            <Text fw={700} fz={{ base: "lg", sm: "xl" }}>
              {ratingHistory.bullet}
            </Text>
          </Stack>
        )}
      </Group>
    </Card>
  );
}
