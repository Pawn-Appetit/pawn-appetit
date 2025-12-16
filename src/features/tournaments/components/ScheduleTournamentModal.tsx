import { ActionIcon, Button, Divider, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconCopy, IconShare } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { fetch } from "@tauri-apps/plugin-http";
import type { TournamentTemplate } from "@/utils/tournamentTemplates";

interface ScheduleTournamentModalProps {
  opened: boolean;
  onClose: () => void;
  template: TournamentTemplate;
  lichessToken: string | null;
  onSuccess?: () => void;
}

export function ScheduleTournamentModal({
  opened,
  onClose,
  template,
  lichessToken,
  onSuccess,
}: ScheduleTournamentModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [tournamentUrl, setTournamentUrl] = useState<string | null>(null);
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const handleSchedule = async () => {
    if (!lichessToken) {
      notifications.show({
        title: t("common.error", "Error"),
        message: t(
          "features.tournaments.create.noToken",
          "Lichess token not found. Please add your Lichess token in the main account settings.",
        ),
        color: "red",
      });
      return;
    }

    if (!startDate) {
      notifications.show({
        title: t("common.error", "Error"),
        message: t("features.tournaments.schedule.dateRequired", "Start date is required"),
        color: "red",
      });
      return;
    }

    // Parse the date and convert to ISO format with time
    let startTime: Date;
    try {
      startTime = new Date(startDate);
      if (isNaN(startTime.getTime())) {
        throw new Error("Invalid date");
      }
    } catch (error) {
      notifications.show({
        title: t("common.error", "Error"),
        message: t("features.tournaments.schedule.invalidDate", "Invalid date format"),
        color: "red",
      });
      return;
    }

    setLoading(true);
    try {
      // Build the request body according to Lichess API
      const body = new URLSearchParams();
      body.append("name", template.name);
      if (template.description) {
        body.append("description", template.description);
      }
      body.append("clockTime", template.clockTime.toString());
      body.append("clockIncrement", template.clockIncrement.toString());
      body.append("minutes", template.minutes.toString());
      body.append("variant", template.variant);
      body.append("rated", template.rated.toString());
      body.append("berserkable", template.berserkable.toString());
      body.append("streakable", template.streakable.toString());
      body.append("hasChat", template.hasChat.toString());
      
      // Add start time - Lichess API expects ISO 8601 format or milliseconds
      // Try ISO format first, if that doesn't work, try milliseconds
      const isoString = startTime.toISOString();
      body.append("startDate", isoString);
      
      if (template.position) {
        body.append("position", template.position);
      }
      if (template.password) {
        body.append("password", template.password);
      }
      if (template.teamBattleByTeam) {
        body.append("teamBattleByTeam", template.teamBattleByTeam);
      }
      
      // Add team restriction if specified
      // Lichess API expects the team ID in a specific format
      if (template.teamRestriction && template.teamRestriction.trim()) {
        const teamId = template.teamRestriction.trim();
        // Try bracket notation format which is more standard for form-encoded data
        // This format: conditions[teamMember][teamId] is commonly used in HTML forms
        body.append("conditions[teamMember][teamId]", teamId);
      }

      // Add conditions if enabled
      if (template.conditions.minRating.enabled) {
        body.append("minRating.rating", template.conditions.minRating.rating.toString());
      }
      if (template.conditions.maxRating.enabled) {
        body.append("maxRating.rating", template.conditions.maxRating.rating.toString());
      }
      if (template.conditions.nbRatedGame.enabled) {
        body.append("nbRatedGame.nb", template.conditions.nbRatedGame.nb.toString());
      }

      const response = await fetch("https://lichess.org/api/tournament", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lichessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      // Extract tournament ID and URL from response
      // Lichess API returns an object with 'id' field, URL is https://lichess.org/tournament/{id}
      let url: string;
      let id: string | null = null;
      
      if (result.id) {
        id = result.id;
        url = `https://lichess.org/tournament/${result.id}`;
      } else if (result.url) {
        url = result.url;
        // Try to extract ID from URL
        const urlMatch = result.url.match(/\/tournament\/([^\/]+)/);
        if (urlMatch) {
          id = urlMatch[1];
        }
      } else {
        // Fallback: try to extract from response
        if (result.fullName) {
          id = result.fullName;
          url = `https://lichess.org/tournament/${result.fullName}`;
        } else {
          url = "";
        }
      }
      
      setTournamentUrl(url);
      setTournamentId(id);

      if (onSuccess) {
        onSuccess();
      }
      // Don't close the modal - let user see the ID and URL
    } catch (error) {
      console.error("Error scheduling tournament:", error);
      
      // Try to parse error message for better user feedback
      let errorMessage = t("features.tournaments.schedule.error", "Failed to schedule tournament");
      if (error instanceof Error) {
        try {
          const errorData = JSON.parse(error.message);
          if (errorData["conditions.teamMember.teamId"]) {
            errorMessage = t(
              "features.tournaments.schedule.invalidTeamId",
              "Invalid team ID. Please verify that the team ID is correct and that you have access to it."
            );
          } else if (errorData.error) {
            errorMessage = errorData.error.message || error.message;
          } else {
            errorMessage = error.message;
          }
        } catch {
          errorMessage = error.message;
        }
      }
      
      notifications.show({
        title: t("common.error", "Error"),
        message: errorMessage,
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!tournamentUrl) return;
    
    try {
      await navigator.clipboard.writeText(tournamentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy URL:", error);
      notifications.show({
        title: t("common.error", "Error"),
        message: t("features.tournaments.schedule.copyError", "Failed to copy URL"),
        color: "red",
      });
    }
  };

  const handleShare = async () => {
    if (!tournamentUrl) return;
    
    try {
      await navigator.clipboard.writeText(tournamentUrl);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch (error) {
      console.error("Failed to copy URL:", error);
      notifications.show({
        title: t("common.error", "Error"),
        message: t("features.tournaments.schedule.copyError", "Failed to copy URL"),
        color: "red",
      });
    }
  };

  const handleCopyId = async () => {
    if (!tournamentId) return;
    
    try {
      await navigator.clipboard.writeText(tournamentId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy ID:", error);
      notifications.show({
        title: t("common.error", "Error"),
        message: t("features.tournaments.schedule.copyError", "Failed to copy ID"),
        color: "red",
      });
    }
  };

  const handleClose = () => {
    setTournamentUrl(null);
    setTournamentId(null);
    setStartDate("");
    setCopied(false);
    setShared(false);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t("features.tournaments.schedule.title", "Schedule Tournament")}
      size="md"
    >
      <Stack gap="md">
        {!tournamentUrl ? (
          <>
            <Text size="sm" c="dimmed">
              {t("features.tournaments.schedule.description", "Select the date and time when the tournament should start")}
            </Text>

            <TextInput
              label={t("features.tournaments.schedule.startDate", "Start Date & Time")}
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.currentTarget.value)}
              required
            />
          </>
        ) : (
          <>
            <Text size="sm" fw={600}>
              {t("features.tournaments.schedule.successTitle", "Tournament Created Successfully!")}
            </Text>
            <Text size="sm" c="dimmed">
              {t("features.tournaments.schedule.shareUrl", "Share this URL to invite players:")}
            </Text>
            
            <Group gap="xs">
              <TextInput
                value={tournamentUrl}
                readOnly
                style={{ flex: 1 }}
                styles={{
                  input: {
                    fontFamily: "monospace",
                    fontSize: "0.875rem",
                  },
                }}
              />
              <ActionIcon
                color={copied ? "green" : "blue"}
                variant="light"
                size="lg"
                onClick={handleCopyUrl}
                title={t("common.copy", "Copy")}
              >
                {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
              </ActionIcon>
            </Group>
          </>
        )}
      </Stack>

      {tournamentId && (
        <>
          <Divider my="md" />
          <Group justify="space-between" align="center">
            <Group gap="xs" align="center">
              <Text size="sm" fw={500}>
                {t("features.tournaments.schedule.tournamentId", "Tournament ID:")}
              </Text>
              <TextInput
                value={tournamentId}
                readOnly
                style={{ width: "150px" }}
                styles={{
                  input: {
                    fontFamily: "monospace",
                    fontSize: "0.875rem",
                  },
                }}
              />
              <ActionIcon
                color={copied ? "green" : "blue"}
                variant="light"
                size="md"
                onClick={handleCopyId}
                title={t("common.copy", "Copy ID")}
              >
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </ActionIcon>
            </Group>
            <Button
              leftSection={shared ? <IconCheck size={16} /> : <IconShare size={16} />}
              variant={shared ? "light" : "filled"}
              color={shared ? "green" : "blue"}
              onClick={handleShare}
            >
              {shared
                ? t("features.tournaments.schedule.shared", "Shared!")
                : t("features.tournaments.schedule.share", "Share")}
            </Button>
          </Group>
        </>
      )}

      <Group justify="flex-end" mt="md">
        {!tournamentUrl ? (
          <>
            <Button variant="subtle" onClick={handleClose} disabled={loading}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={handleSchedule} loading={loading} disabled={!startDate}>
              {t("features.tournaments.schedule.button", "Schedule")}
            </Button>
          </>
        ) : (
          <Button onClick={handleClose}>
            {t("common.close", "Close")}
          </Button>
        )}
      </Group>
    </Modal>
  );
}

