import { Badge, Box, Button, Card, Group, Image, Stack, Text, Title } from "@mantine/core";
import { IconChess, IconUpload } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { convertFileSrc } from "@tauri-apps/api/core";
import { currentThemeIdAtom } from "@/features/themes/state/themeAtoms";

interface WelcomeCardProps {
  isFirstOpen: boolean;
  onPlayChess: () => void;
  onImportGame: () => void;
  playerFirstName?: string;
  playerGender?: "male" | "female";
  fideInfo?: {
    title?: string;
    standardRating?: number;
    rapidRating?: number;
    blitzRating?: number;
    worldRank?: number;
    nationalRank?: number;
    photo?: string;
    age?: number;
  };
}

export function WelcomeCard({ isFirstOpen, onPlayChess, onImportGame, playerFirstName, playerGender, fideInfo }: WelcomeCardProps) {
  const { t } = useTranslation();
  const currentThemeId = useAtomValue(currentThemeIdAtom);
  const [imageError, setImageError] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  
  // Convert file path to URL if needed (for local files)
  // If it's already a URL (http/https) or tauri://, use it directly
  useEffect(() => {
    if (!fideInfo?.photo) {
      setPhotoUrl(undefined);
      return;
    }

    // If it's already a URL (http, https, or tauri://), use it directly
    if (
      fideInfo.photo.startsWith("http://") ||
      fideInfo.photo.startsWith("https://") ||
      fideInfo.photo.startsWith("tauri://")
    ) {
      setPhotoUrl(fideInfo.photo);
      return;
    }

    try {
      // convertFileSrc es síncrono y devuelve string
      const url = convertFileSrc(fideInfo.photo);
      setPhotoUrl(url);
    } catch (error) {
      console.error("Failed to convert file path to URL:", error);
      // Fallback to original path - might work in some cases
      setPhotoUrl(fideInfo.photo);
    }
  }, [fideInfo?.photo]);

  // Determine theme-based background image
  const isAcademiaMaya = currentThemeId === "academia-maya";
  const backgroundImageSrc = isAcademiaMaya ? "/academia.maya.png" : "/chess-play.jpg";
  const backgroundImageAlt = isAcademiaMaya ? "Academia Maya" : "Chess play";

  const handleImageError = () => {
    if (isAcademiaMaya && !imageError) {
      setImageError(true);
    }
  };

  // Determine welcome message based on first open, player name, title, and gender
  let welcomeMessage: string;
  
  if (isFirstOpen) {
    welcomeMessage = t("features.dashboard.welcome.firstOpen");
  } else if (playerFirstName) {
    const genderKey = playerGender === "female" ? "female" : "male";
    // If there's a FIDE title, include it in the greeting
    if (fideInfo?.title) {
      const nameWithTitle = `${fideInfo.title} ${playerFirstName}`;
      welcomeMessage = t(`features.dashboard.welcome.backWithName.${genderKey}`, { 
        name: nameWithTitle
      });
    } else {
      welcomeMessage = t(`features.dashboard.welcome.backWithName.${genderKey}`, { 
        name: playerFirstName 
      });
    }
  } else {
    welcomeMessage = t("features.dashboard.welcome.back");
  }

  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Group align="flex-start" justify="space-between" wrap="nowrap" gap="xl">
        {/* Left column: FIDE profile photo - only show if it exists */}
        {photoUrl ? (
          <Box
            style={{
              position: "relative",
              borderRadius: "12px",
              overflow: "hidden",
              border: "3px solid var(--mantine-color-blue-6)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              flexShrink: 0,
            }}
          >
            <Image
              src={photoUrl}
              alt="FIDE Profile Photo"
              width={140}
              height={140}
              fit="cover"
              onError={(e) => {
                console.error("Failed to load FIDE photo:", photoUrl);
                e.currentTarget.style.display = "none";
              }}
            />
          </Box>
        ) : null}
        
        {/* Central column: Information and actions */}
        <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
          <Stack gap={4}>
            <Title order={1} fw={800}>
              {welcomeMessage}
            </Title>
            <Text size="sm" c="dimmed">
              {t("features.dashboard.welcome.desc")}
            </Text>
          </Stack>
          
          {/* FIDE Information */}
          {fideInfo && (fideInfo.title || fideInfo.age || fideInfo.worldRank || fideInfo.nationalRank) && (
            <Group gap="md" wrap="wrap">
              {fideInfo.title && (
                <Badge size="lg" color="yellow" variant="light">
                  {fideInfo.title}
                </Badge>
              )}
              {fideInfo.age && (
                <Badge size="lg" color="blue" variant="light">
                  {fideInfo.age} {t("common.years")}
                </Badge>
              )}
              {fideInfo.worldRank && (
                <Badge size="lg" color="grape" variant="light">
                  World #{fideInfo.worldRank}
                </Badge>
              )}
              {fideInfo.nationalRank && (
                <Badge size="lg" color="teal" variant="light">
                  National #{fideInfo.nationalRank}
                </Badge>
              )}
            </Group>
          )}
          
          {/* Ratings FIDE */}
          {fideInfo && (fideInfo.standardRating || fideInfo.rapidRating || fideInfo.blitzRating) && (
            <Group gap="xl" align="flex-start">
              {fideInfo.standardRating && (
                <Stack gap={2} align="center">
                  <Text size="xs" c="teal.6" fw={500}>
                    {t("features.dashboard.editProfile.standard")}
                  </Text>
                  <Text fz={{ base: "1.375rem", sm: "1.625rem", md: "1.875rem" }} c="teal.6" fw={700} lh={1}>
                    {fideInfo.standardRating}
                  </Text>
                </Stack>
              )}
              {fideInfo.rapidRating && (
                <Stack gap={2} align="center">
                  <Text size="xs" c="teal.6" fw={500}>
                    {t("features.dashboard.editProfile.rapid")}
                  </Text>
                  <Text fz={{ base: "1.375rem", sm: "1.625rem", md: "1.875rem" }} c="teal.6" fw={700} lh={1}>
                    {fideInfo.rapidRating}
                  </Text>
                </Stack>
              )}
              {fideInfo.blitzRating && (
                <Stack gap={2} align="center">
                  <Text size="xs" c="yellow.6" fw={500}>
                    {t("features.dashboard.editProfile.blitz")}
                  </Text>
                  <Text fz={{ base: "1.375rem", sm: "1.625rem", md: "1.875rem" }} c="yellow.6" fw={700} lh={1}>
                    {fideInfo.blitzRating}
                  </Text>
                </Stack>
              )}
            </Group>
          )}
          
          {/* Action buttons */}
          <Group gap="xs" mt="xs">
            <Button radius="md" onClick={onPlayChess} leftSection={<IconChess size={18} />}>
              {t("features.dashboard.cards.playChess.button")}
            </Button>
            <Button variant="light" radius="md" onClick={onImportGame} leftSection={<IconUpload size={18} />}>
              {t("features.tabs.importGame.button")}
            </Button>
          </Group>
        </Stack>
        
        {/* Columna derecha: Imagen de fondo del tema */}
        <Box style={{ flexShrink: 0 }}>
          <Image 
            src={backgroundImageSrc} 
            alt={backgroundImageAlt} 
            radius="lg" 
            onError={handleImageError}
            width={280}
            height={280}
            fit="contain"
          />
        </Box>
      </Group>
    </Card>
  );
}
