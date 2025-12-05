import { ActionIcon, Avatar, Badge, Box, Card, Divider, Group, Stack, Text } from "@mantine/core";
import { IconEdit } from "@tabler/icons-react";
import { useState } from "react";
import { EditProfileModal } from "./EditProfileModal";

interface RatingHistory {
  classical?: number;
  rapid?: number;
  blitz?: number;
  bullet?: number;
}

interface FidePlayerData {
  name: string; 
  firstName: string; 
  gender: "male" | "female";
  title?: string;
  standardRating?: number;
  rapidRating?: number;
  blitzRating?: number;
  worldRank?: number;
  nationalRank?: number;
  photo?: string;
}

interface UserProfileCardProps {
  name: string;
  handle: string;
  title: string;
  ratingHistory: RatingHistory;
  onFideUpdate?: (fideId: string, fidePlayer: FidePlayerData | null, displayName?: string) => void;
  currentFideId?: string;
  fidePlayer?: FidePlayerData | null;
  customName?: string; // Nombre personalizado para mostrar
}

export function UserProfileCard({ name, handle, title, ratingHistory, onFideUpdate, currentFideId, fidePlayer, customName }: UserProfileCardProps) {
  const [editModalOpened, setEditModalOpened] = useState(false);

  const handleSave = (fideId: string, fidePlayer: FidePlayerData | null, displayName?: string) => {
    if (onFideUpdate) {
      onFideUpdate(fideId, fidePlayer, displayName);
    }
  };

  // Si hay un nombre personalizado, usarlo; sino usar el nombre original
  const displayName = customName && customName.trim() ? customName : name;

  // Determinar qué título mostrar (FIDE title tiene prioridad si existe)
  const displayTitle = fidePlayer?.title || title;
  
  // Determinar qué ratings mostrar (FIDE ratings tienen prioridad si existen)
  const displayRatings = {
    classical: fidePlayer?.standardRating || ratingHistory.classical,
    rapid: fidePlayer?.rapidRating || ratingHistory.rapid,
    blitz: fidePlayer?.blitzRating || ratingHistory.blitz,
    bullet: ratingHistory.bullet,
  };

  return (
    <>
      <Card withBorder p="lg" radius="md" h="100%">
        <Box>
          <Group gap={6} justify="space-between" wrap="nowrap">
            <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <Text fw={700} truncate>{displayName}</Text>
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={() => setEditModalOpened(true)}
                title="Edit profile"
              >
                <IconEdit size={16} />
              </ActionIcon>
            </Group>
            {displayTitle && (
              <Badge color="yellow" variant="light">
                {displayTitle}
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed" truncate>
            {handle}
          </Text>
        </Box>
        <Divider my="md" />
        <Group justify="space-between" align="stretch">
          {displayRatings.classical && (
            <Stack gap={2} p={{ base: "xs", sm: "md" }} style={{ flex: 1 }}>
              <Text size="xs" c="teal.6">
                Classical
              </Text>
              <Text fw={700} fz={{ base: "lg", sm: "xl" }}>
                {displayRatings.classical}
              </Text>
            </Stack>
          )}
          {displayRatings.rapid && (
            <Stack gap={2} p={{ base: "xs", sm: "md" }} style={{ flex: 1 }}>
              <Text size="xs" c="teal.6">
                Rapid
              </Text>
              <Text fw={700} fz={{ base: "lg", sm: "xl" }}>
                {displayRatings.rapid}
              </Text>
            </Stack>
          )}
          {displayRatings.blitz && (
            <Stack gap={2} p={{ base: "xs", sm: "md" }} style={{ flex: 1 }}>
              <Text size="xs" c="yellow.6">
                Blitz
              </Text>
              <Text fw={700} fz={{ base: "lg", sm: "xl" }}>
                {displayRatings.blitz}
              </Text>
            </Stack>
          )}
          {displayRatings.bullet && (
            <Stack gap={2} p={{ base: "xs", sm: "md" }} style={{ flex: 1 }}>
              <Text size="xs" c="blue.6">
                Bullet
              </Text>
              <Text fw={700} fz={{ base: "lg", sm: "xl" }}>
                {displayRatings.bullet}
              </Text>
            </Stack>
          )}
        </Group>
      </Card>
      <EditProfileModal
        opened={editModalOpened}
        onClose={() => setEditModalOpened(false)}
        onSave={handleSave}
        currentFideId={currentFideId}
        currentDisplayName={customName}
      />
    </>
  );
}
