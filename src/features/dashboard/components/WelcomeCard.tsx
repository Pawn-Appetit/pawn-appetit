import { Badge, Box, Button, Card, Group, Image, Stack, Text, Title } from "@mantine/core";
import { IconChess, IconUpload } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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

  // Determine theme-based background image
  const isAcademiaMaya = currentThemeId === "academia-maya";
  const backgroundImageSrc = isAcademiaMaya ? "/academia.maya.png" : "/chess-play.jpg";
  const backgroundImageAlt = isAcademiaMaya ? "Academia Maya" : "Chess play";

  const handleImageError = () => {
    if (isAcademiaMaya && !imageError) {
      console.warn(`Academia Maya image not found. Please save the image as "academia.maya.png" in the public folder.`);
      setImageError(true);
    }
  };

  // Debug: Log fideInfo to see what we're receiving
  if (fideInfo) {
    console.log("WelcomeCard fideInfo:", fideInfo);
    console.log("Ratings check:", {
      standard: fideInfo.standardRating,
      rapid: fideInfo.rapidRating,
      blitz: fideInfo.blitzRating,
      hasStandard: !!fideInfo.standardRating,
      hasRapid: !!fideInfo.rapidRating,
      hasBlitz: !!fideInfo.blitzRating,
    });
  }

  // Determine welcome message based on first open, player name, title, and gender
  let welcomeMessage: string;
  
  // Debug: Log fideInfo to see what we're receiving
  console.log("WelcomeCard - fideInfo:", fideInfo);
  console.log("WelcomeCard - fideInfo.title:", fideInfo?.title);
  console.log("WelcomeCard - playerFirstName:", playerFirstName);
  
  if (isFirstOpen) {
    welcomeMessage = t("features.dashboard.welcome.firstOpen");
  } else if (playerFirstName) {
    const genderKey = playerGender === "female" ? "female" : "male";
    // Si tiene título FIDE, incluirlo en el saludo
    if (fideInfo?.title) {
      const nameWithTitle = `${fideInfo.title} ${playerFirstName}`;
      console.log("WelcomeCard - Using title in greeting:", nameWithTitle);
      welcomeMessage = t(`features.dashboard.welcome.backWithName.${genderKey}`, { 
        name: nameWithTitle
      });
    } else {
      console.log("WelcomeCard - No title, using firstName only");
      welcomeMessage = t(`features.dashboard.welcome.backWithName.${genderKey}`, { 
        name: playerFirstName 
      });
    }
  } else {
    welcomeMessage = t("features.dashboard.welcome.back");
  }
  
  console.log("WelcomeCard - Final welcomeMessage:", welcomeMessage);

  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Group align="flex-start" justify="space-between" wrap="nowrap" gap="xl">
        {/* Columna izquierda: Foto de perfil FIDE - solo mostrar si existe */}
        {fideInfo?.photo ? (
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
              src={fideInfo.photo}
              alt="FIDE Profile Photo"
              width={140}
              height={140}
              fit="cover"
              onError={(e) => {
                console.error("Failed to load FIDE photo:", fideInfo.photo);
                e.currentTarget.style.display = "none";
              }}
            />
          </Box>
        ) : null}
        
        {/* Columna central: Información y acciones */}
        <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
          <Stack gap={4}>
            <Title order={1} fw={800}>
              {welcomeMessage}
            </Title>
            <Text size="sm" c="dimmed">
              {t("features.dashboard.welcome.desc")}
            </Text>
          </Stack>
          
          {/* Información FIDE */}
          {fideInfo && (fideInfo.title || fideInfo.age || fideInfo.worldRank || fideInfo.nationalRank) && (
            <Group gap="md" wrap="wrap">
              {fideInfo.title && (
                <Badge size="lg" color="yellow" variant="light">
                  {fideInfo.title}
                </Badge>
              )}
              {fideInfo.age && (
                <Badge size="lg" color="blue" variant="light">
                  {fideInfo.age} años
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
                  <Text size="xs" c="dimmed" fw={500}>
                    {t("features.dashboard.editProfile.standard")}
                  </Text>
                  <Text size="xl" c="dark" fw={700}>
                    {fideInfo.standardRating}
                  </Text>
                </Stack>
              )}
              {fideInfo.rapidRating && (
                <Stack gap={2} align="center">
                  <Text size="xs" c="dimmed" fw={500}>
                    {t("features.dashboard.editProfile.rapid")}
                  </Text>
                  <Text size="xl" c="dark" fw={700}>
                    {fideInfo.rapidRating}
                  </Text>
                </Stack>
              )}
              {fideInfo.blitzRating && (
                <Stack gap={2} align="center">
                  <Text size="xs" c="dimmed" fw={500}>
                    {t("features.dashboard.editProfile.blitz")}
                  </Text>
                  <Text size="xl" c="dark" fw={700}>
                    {fideInfo.blitzRating}
                  </Text>
                </Stack>
              )}
            </Group>
          )}
          
          {/* Botones de acción */}
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
