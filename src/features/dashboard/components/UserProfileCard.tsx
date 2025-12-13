import { ActionIcon, Avatar, Badge, Box, Card, Divider, Group, Image, rem, Stack, Text } from "@mantine/core";
import { IconEdit } from "@tabler/icons-react";
import { useState } from "react";
import LichessLogo from "@/features/accounts/components/LichessLogo";
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
  age?: number;
  birthYear?: number;
}

interface UserProfileCardProps {
  name: string;
  handle: string;
  title: string;
  ratingHistory: RatingHistory;
  onFideUpdate?: (fideId: string, fidePlayer: FidePlayerData | null, displayName?: string) => void;
  currentFideId?: string;
  fidePlayer?: FidePlayerData | null;
  customName?: string; // Custom name to display
  platform?: "lichess" | "chesscom" | null; // Platform of the main account
}

export function UserProfileCard({ name, handle, title, ratingHistory, onFideUpdate, currentFideId, fidePlayer, customName, platform }: UserProfileCardProps) {
  const [editModalOpened, setEditModalOpened] = useState(false);

  const handleSave = (fideId: string, fidePlayer: FidePlayerData | null, displayName?: string) => {
    if (onFideUpdate) {
      onFideUpdate(fideId, fidePlayer, displayName);
    }
  };

  // If there's a custom name, use it; otherwise use the original name
  const displayName = customName && customName.trim() ? customName : name;

  // Determine which title to display (FIDE title has priority if it exists)
  const displayTitle = fidePlayer?.title || title;
  
  // Determine which ratings to display
  // Priority: Online account ratings (Chess.com/Lichess) > FIDE ratings
  // This ensures that when the main account is from Chess.com or Lichess,
  // we show the actual online ratings, not FIDE ratings
  // Only show classical if platform is Lichess (Chess.com doesn't have classical)
  const displayRatings = {
    classical: platform === "lichess" ? (ratingHistory.classical || fidePlayer?.standardRating) : undefined,
    rapid: ratingHistory.rapid || fidePlayer?.rapidRating,
    blitz: ratingHistory.blitz || fidePlayer?.blitzRating,
    bullet: ratingHistory.bullet,
  };

  return (
    <>
      <Card withBorder p="lg" radius="md" h="100%">
        <Box>
          <Group gap={6} justify="space-between" wrap="nowrap">
            <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              {platform && (
                <Box
                  style={{
                    width: rem(24),
                    height: rem(24),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {platform === "lichess" ? (
                    <LichessLogo />
                  ) : (
                    <Image w={rem(24)} h={rem(24)} src="/chesscom.png" alt="chess.com" />
                  )}
                </Box>
              )}
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
