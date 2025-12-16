import { ActionIcon, Badge, Button, Card, Group, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { deleteTournamentTemplate, getTournamentTemplates, type TournamentTemplate } from "@/utils/tournamentTemplates";
import { ScheduleTournamentModal } from "./ScheduleTournamentModal";

interface TournamentListProps {
  lichessToken: string | null;
  accountName: string | null;
  onRefresh?: () => void;
}

export function TournamentList({ lichessToken, accountName, onRefresh }: TournamentListProps) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<TournamentTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [scheduleModalOpened, setScheduleModalOpened] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TournamentTemplate | null>(null);

  const loadTemplates = async () => {
    if (!accountName) {
      setTemplates([]);
      return;
    }

    setLoading(true);
    try {
      const loadedTemplates = await getTournamentTemplates(accountName);
      setTemplates(loadedTemplates);
    } catch (error) {
      console.error("Error loading tournament templates:", error);
      notifications.show({
        title: t("common.error", "Error"),
        message: t("features.tournaments.browse.loadError", "Failed to load tournament templates"),
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [accountName]);

  useEffect(() => {
    if (onRefresh) {
      // Reload when refresh is triggered
      loadTemplates();
    }
  }, [onRefresh]);

  const handleDelete = async (id: string) => {
    if (!accountName) {
      return;
    }

    try {
      await deleteTournamentTemplate(id, accountName);
      await loadTemplates();
      notifications.show({
        title: t("common.success", "Success"),
        message: t("features.tournaments.browse.deleted", "Tournament template deleted"),
        color: "green",
      });
    } catch (error) {
      console.error("Error deleting tournament template:", error);
      notifications.show({
        title: t("common.error", "Error"),
        message: t("features.tournaments.browse.deleteError", "Failed to delete tournament template"),
        color: "red",
      });
    }
  };

  const handleSchedule = (template: TournamentTemplate) => {
    setSelectedTemplate(template);
    setScheduleModalOpened(true);
  };

  const formatTimeControl = (clockTime: number, clockIncrement: number) => {
    return `${clockTime}+${clockIncrement}`;
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  };

  if (loading && templates.length === 0) {
    return (
      <Card withBorder p="md">
        <Text c="dimmed">{t("common.loading", "Loading...")}</Text>
      </Card>
    );
  }

  if (templates.length === 0) {
    return (
      <Card withBorder p="md">
        <Text c="dimmed">{t("features.tournaments.browse.noTemplates", "No tournament templates found")}</Text>
      </Card>
    );
  }

  return (
    <>
      <Stack gap="md">
        {templates.map((template) => (
          <Card key={template.id} withBorder p="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap="xs" style={{ flex: 1 }}>
                <Group gap="xs" align="center">
                  <Text fw={600} size="lg">
                    {template.name}
                  </Text>
                  <Badge variant="light" color="blue">
                    {formatTimeControl(template.clockTime, template.clockIncrement)}
                  </Badge>
                  <Badge variant="light" color="gray">
                    {formatDuration(template.minutes)}
                  </Badge>
                </Group>
                {template.description && (
                  <Text size="sm" c="dimmed" lineClamp={2}>
                    {template.description}
                  </Text>
                )}
              </Stack>
              <Group gap="xs">
                <Button
                  leftSection={<IconCalendar size={16} />}
                  onClick={() => handleSchedule(template)}
                  disabled={!lichessToken}
                  variant="light"
                >
                  {t("features.tournaments.browse.schedule", "Schedule")}
                </Button>
                <ActionIcon
                  color="red"
                  variant="light"
                  onClick={() => handleDelete(template.id)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>

      {selectedTemplate && (
        <ScheduleTournamentModal
          opened={scheduleModalOpened}
          onClose={() => {
            setScheduleModalOpened(false);
            setSelectedTemplate(null);
          }}
          template={selectedTemplate}
          lichessToken={lichessToken}
          onSuccess={() => {
            // Don't close the modal here - let the user see the tournament ID and URL
            // The modal will be closed when the user clicks "Close"
            loadTemplates();
          }}
        />
      )}
    </>
  );
}

