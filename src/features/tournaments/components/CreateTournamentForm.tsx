import {
  Button,
  Card,
  Checkbox,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { saveTournamentTemplate } from "@/utils/tournamentTemplates";

interface CreateTournamentFormProps {
  lichessToken: string | null;
  accountName: string | null;
  onTemplateSaved?: () => void;
}

export function CreateTournamentForm({ lichessToken, accountName, onTemplateSaved }: CreateTournamentFormProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    clockTime: 5,
    clockIncrement: 0,
    minutes: 60,
    variant: "standard",
    rated: true,
    position: "",
    berserkable: true,
    streakable: false,
    hasChat: true,
    password: "",
    teamBattleByTeam: "",
    teamRestriction: "",
    conditions: {
      minRating: {
        enabled: false,
        rating: 1500,
      },
      maxRating: {
        enabled: false,
        rating: 2500,
      },
      nbRatedGame: {
        enabled: false,
        nb: 0,
      },
    },
  });

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      notifications.show({
        title: t("common.error", "Error"),
        message: t("features.tournaments.createTab.nameRequired", "Tournament name is required"),
        color: "red",
      });
      return;
    }

    if (!accountName) {
      notifications.show({
        title: t("common.error", "Error"),
        message: t("features.tournaments.createTab.noAccount", "No account selected. Please select a main account first."),
        color: "red",
      });
      return;
    }

    setLoading(true);
    try {
      // Save as template instead of creating directly
      await saveTournamentTemplate(formData, accountName);
      
      notifications.show({
        title: t("common.success", "Success"),
        message: t("features.tournaments.createTab.templateSaved", "Tournament template saved successfully!"),
        color: "green",
      });

      // Trigger refresh callback
      if (onTemplateSaved) {
        onTemplateSaved();
      }
      
      // Dispatch event for other components
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("tournament-template-saved"));
      }

      // Reset form
      setFormData({
        name: "",
        description: "",
        clockTime: 5,
        clockIncrement: 0,
        minutes: 60,
        variant: "standard",
        rated: true,
        position: "",
        berserkable: true,
        streakable: false,
        hasChat: true,
        password: "",
        teamBattleByTeam: "",
        teamRestriction: "",
        conditions: {
          minRating: { enabled: false, rating: 1500 },
          maxRating: { enabled: false, rating: 2500 },
          nbRatedGame: { enabled: false, nb: 0 },
        },
      });
    } catch (error) {
      console.error("Error saving tournament template:", error);
      notifications.show({
        title: t("common.error", "Error"),
        message:
          error instanceof Error
            ? error.message
            : t("features.tournaments.createTab.error", "Failed to save tournament template"),
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };


  return (
    <Card withBorder p="md">
      <Stack gap="md">
        <Text size="lg" fw={600}>
          {t("features.tournaments.createTab.title", "Create Tournament Template")}
        </Text>
        <Text size="sm" c="dimmed">
          {t("features.tournaments.createTab.description", "Create a new tournament template (schedule it later from the Search tab)")}
        </Text>

        <TextInput
          label={t("features.tournaments.createTab.fields.name", "Tournament Name")}
          placeholder={t("features.tournaments.createTab.fields.namePlaceholder", "Enter tournament name")}
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
        />

        <Textarea
          label={t("features.tournaments.createTab.fields.description", "Description")}
          placeholder={t("features.tournaments.createTab.fields.descriptionPlaceholder", "Optional description")}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.currentTarget.value })}
          minRows={3}
        />

        <Group grow>
          <NumberInput
            label={t("features.tournaments.createTab.fields.clockTime", "Clock Time (minutes)")}
            placeholder="5"
            min={1}
            max={180}
            value={formData.clockTime}
            onChange={(value) => setFormData({ ...formData, clockTime: Number(value) || 5 })}
          />
          <NumberInput
            label={t("features.tournaments.createTab.fields.clockIncrement", "Increment (seconds)")}
            placeholder="0"
            min={0}
            max={60}
            value={formData.clockIncrement}
            onChange={(value) => setFormData({ ...formData, clockIncrement: Number(value) || 0 })}
          />
        </Group>

        <NumberInput
          label={t("features.tournaments.createTab.fields.minutes", "Duration (minutes)")}
          placeholder="60"
          min={1}
          max={1440}
          value={formData.minutes}
          onChange={(value) => setFormData({ ...formData, minutes: Number(value) || 60 })}
        />

        <Select
          label={t("features.tournaments.createTab.fields.variant", "Variant")}
          data={[
            { value: "standard", label: t("features.tournaments.createTab.variants.standard", "Standard") },
            { value: "chess960", label: "Chess960" },
            { value: "crazyhouse", label: "Crazyhouse" },
            { value: "antichess", label: "Antichess" },
            { value: "atomic", label: "Atomic" },
            { value: "horde", label: "Horde" },
            { value: "kingOfTheHill", label: "King of the Hill" },
            { value: "racingKings", label: "Racing Kings" },
            { value: "threeCheck", label: "Three Check" },
          ]}
          value={formData.variant}
          onChange={(value) => setFormData({ ...formData, variant: value || "standard" })}
        />

        <Stack gap="xs">
          <Checkbox
            label={t("features.tournaments.createTab.fields.rated", "Rated")}
            checked={formData.rated}
            onChange={(e) => setFormData({ ...formData, rated: e.currentTarget.checked })}
          />
          <Checkbox
            label={t("features.tournaments.createTab.fields.berserkable", "Allow Berserk")}
            checked={formData.berserkable}
            onChange={(e) => setFormData({ ...formData, berserkable: e.currentTarget.checked })}
          />
          <Checkbox
            label={t("features.tournaments.createTab.fields.streakable", "Allow Streak")}
            checked={formData.streakable}
            onChange={(e) => setFormData({ ...formData, streakable: e.currentTarget.checked })}
          />
          <Checkbox
            label={t("features.tournaments.createTab.fields.hasChat", "Enable Chat")}
            checked={formData.hasChat}
            onChange={(e) => setFormData({ ...formData, hasChat: e.currentTarget.checked })}
          />
        </Stack>

        <TextInput
          label={t("features.tournaments.createTab.fields.position", "Starting Position (FEN)")}
          placeholder={t("features.tournaments.createTab.fields.positionPlaceholder", "Optional: Starting FEN position")}
          value={formData.position}
          onChange={(e) => setFormData({ ...formData, position: e.currentTarget.value })}
        />

        <TextInput
          label={t("features.tournaments.createTab.fields.password", "Password (Private Tournament)")}
          placeholder={t("features.tournaments.createTab.fields.passwordPlaceholder", "Optional: Set password for private tournament")}
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.currentTarget.value })}
        />

        <TextInput
          label={t("features.tournaments.createTab.fields.teamBattle", "Team Battle (Team ID)")}
          placeholder={t("features.tournaments.createTab.fields.teamBattlePlaceholder", "Optional: Team ID for team battle")}
          description={t("features.tournaments.createTab.fields.teamBattleDescription", "Create a team battle tournament where players compete in teams")}
          value={formData.teamBattleByTeam}
          onChange={(e) => setFormData({ ...formData, teamBattleByTeam: e.currentTarget.value })}
        />

        <TextInput
          label={t("features.tournaments.createTab.fields.teamRestriction", "Restrict to Team (Team ID)")}
          placeholder={t("features.tournaments.createTab.fields.teamRestrictionPlaceholder", "Optional: Only allow members of this team to join")}
          description={t("features.tournaments.createTab.fields.teamRestrictionDescription", "Enter team ID (e.g., 'torneos-para-pensar' from https://lichess.org/team/torneos-para-pensar) to restrict access to team members only")}
          value={formData.teamRestriction}
          onChange={(e) => setFormData({ ...formData, teamRestriction: e.currentTarget.value })}
        />

        <Stack gap="md" mt="md">
          <Text size="sm" fw={600}>
            {t("features.tournaments.createTab.fields.conditions", "Entry Conditions")}
          </Text>

          <Group grow>
            <Checkbox
              label={t("features.tournaments.createTab.fields.minRating", "Minimum Rating")}
              checked={formData.conditions.minRating.enabled}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  conditions: {
                    ...formData.conditions,
                    minRating: { ...formData.conditions.minRating, enabled: e.currentTarget.checked },
                  },
                })
              }
            />
            {formData.conditions.minRating.enabled && (
              <NumberInput
                placeholder="1500"
                min={0}
                max={3000}
                value={formData.conditions.minRating.rating}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    conditions: {
                      ...formData.conditions,
                      minRating: { ...formData.conditions.minRating, rating: Number(value) || 1500 },
                    },
                  })
                }
              />
            )}
          </Group>

          <Group grow>
            <Checkbox
              label={t("features.tournaments.createTab.fields.maxRating", "Maximum Rating")}
              checked={formData.conditions.maxRating.enabled}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  conditions: {
                    ...formData.conditions,
                    maxRating: { ...formData.conditions.maxRating, enabled: e.currentTarget.checked },
                  },
                })
              }
            />
            {formData.conditions.maxRating.enabled && (
              <NumberInput
                placeholder="2500"
                min={0}
                max={3000}
                value={formData.conditions.maxRating.rating}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    conditions: {
                      ...formData.conditions,
                      maxRating: { ...formData.conditions.maxRating, rating: Number(value) || 2500 },
                    },
                  })
                }
              />
            )}
          </Group>

          <Group grow>
            <Checkbox
              label={t("features.tournaments.createTab.fields.nbRatedGame", "Minimum Rated Games")}
              checked={formData.conditions.nbRatedGame.enabled}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  conditions: {
                    ...formData.conditions,
                    nbRatedGame: { ...formData.conditions.nbRatedGame, enabled: e.currentTarget.checked },
                  },
                })
              }
            />
            {formData.conditions.nbRatedGame.enabled && (
              <NumberInput
                placeholder="0"
                min={0}
                value={formData.conditions.nbRatedGame.nb}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    conditions: {
                      ...formData.conditions,
                      nbRatedGame: { ...formData.conditions.nbRatedGame, nb: Number(value) || 0 },
                    },
                  })
                }
              />
            )}
          </Group>
        </Stack>

        <Button
          leftSection={<IconPlus size={16} />}
          onClick={handleSubmit}
          loading={loading}
          disabled={!formData.name.trim()}
        >
          {t("features.tournaments.createTab.button", "Save as Template")}
        </Button>
      </Stack>
    </Card>
  );
}

