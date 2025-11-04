import { Box, Button, Card, Group, Image, Stack, Text, Title } from "@mantine/core";
import { IconChess, IconUpload } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

interface WelcomeCardProps {
  isFirstOpen: boolean;
  onPlayChess: () => void;
  onImportGame: () => void;
}

export function WelcomeCard({ isFirstOpen, onPlayChess, onImportGame }: WelcomeCardProps) {
  const { t } = useTranslation();

  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Group align="center" justify="space-between" wrap="nowrap">
        <Stack gap={6} flex={6}>
          <Title order={1} fw={800}>
            {t(isFirstOpen ? "features.dashboard.welcome.firstOpen" : "features.dashboard.welcome.back")}
          </Title>
          <Text size="sm" c="dimmed">
            {t("features.dashboard.welcome.desc")}
          </Text>
          <Group gap="xs" mt="xs">
            <Button radius="md" onClick={onPlayChess} leftSection={<IconChess size={18} />}>
              {t("features.dashboard.cards.playChess.button")}
            </Button>
            <Button variant="light" radius="md" onClick={onImportGame} leftSection={<IconUpload size={18} />}>
              {t("features.tabs.importGame.button")}
            </Button>
          </Group>
        </Stack>
        <Box flex={4}>
          <Image src="/chess-play.jpg" alt="Chess play" radius="lg" />
        </Box>
      </Group>
    </Card>
  );
}
