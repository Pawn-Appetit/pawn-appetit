import { Alert, Button, Group, Modal, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { RichTextEditor } from "@mantine/tiptap";
import { IconDownload, IconInfoCircle, IconX } from "@tabler/icons-react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Markdown } from "tiptap-markdown";
import type { VersionInfo } from "@/services/version-checker";
import { skipVersion } from "@/services/version-checker";

function ReleaseNotesRenderer({ content }: { content: string | null }) {
  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: content || "",
    editable: false,
  });

  if (!content) return null;

  return (
    <RichTextEditor editor={editor}>
      <RichTextEditor.Content
        style={{
          fontSize: "14px",
          color: "var(--mantine-color-dimmed)",
          maxHeight: "150px",
          overflow: "auto",
          border: "none",
          backgroundColor: "transparent",
        }}
      />
    </RichTextEditor>
  );
}

export interface UpdateNotificationProps {
  versionInfo: VersionInfo;
  onUpdate: () => void;
  onSkip: () => void;
  onDismiss: () => void;
  isUpdating?: boolean;
}

export function UpdateNotificationModal({
  versionInfo,
  onUpdate,
  onSkip,
  onDismiss,
  isUpdating = false,
}: UpdateNotificationProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(true);

  const handleUpdate = () => {
    onUpdate();
  };

  const handleSkip = () => {
    skipVersion(versionInfo.version);
    onSkip();
    setOpened(false);
  };

  const handleDismiss = () => {
    onDismiss();
    setOpened(false);
  };

  const formatReleaseNotes = (notes?: string) => {
    if (!notes) return null;

    const maxLength = 300;
    if (notes.length <= maxLength) return notes;

    return notes.substring(0, maxLength) + "...";
  };
  return (
    <Modal
      opened={opened}
      onClose={handleDismiss}
      title={
        <Group gap="sm">
          <IconInfoCircle size={24} />
          <Title order={4}>{t("features.updater.newVersionAvailable", "New Version Available")}</Title>
        </Group>
      }
      centered
      size="lg"
    >
      <Stack gap="md">
        <Text size="lg" fw={500}>
          {t("features.updater.versionInfo", {
            version: versionInfo.version,
            defaultValue: `Version ${versionInfo.version} is now available`,
          })}
        </Text>

        {versionInfo.isPrerelease && (
          <Alert
            color="orange"
            icon={<IconInfoCircle size={16} />}
            title={t("features.updater.prereleaseWarning", "Pre-release Version")}
          >
            {t(
              "features.updater.prereleaseDescription",
              "This is a pre-release version and may contain bugs or unfinished features.",
            )}
          </Alert>
        )}

        {versionInfo.releaseNotes && (
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t("features.updater.releaseNotes", "What's New:")}
            </Text>
            <ReleaseNotesRenderer content={formatReleaseNotes(versionInfo.releaseNotes)} />
            {versionInfo.releaseNotes.length > 300 && versionInfo.downloadUrl && (
              <Text size="xs" c="dimmed">
                <a
                  href={versionInfo.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "inherit" }}
                >
                  {t("features.updater.viewFullNotes", "View full release notes")}
                </a>
              </Text>
            )}
          </Stack>
        )}

        {versionInfo.publishedAt && (
          <Text size="xs" c="dimmed">
            {t("features.updater.publishedAt", {
              date: new Date(versionInfo.publishedAt).toLocaleDateString(),
              defaultValue: `Published: ${new Date(versionInfo.publishedAt).toLocaleDateString()}`,
            }).replace(/&#x2F;/g, "/")}
          </Text>
        )}

        <Group justify="space-between" mt="md">
          <Group gap="sm">
            <Button variant="subtle" onClick={handleSkip} disabled={isUpdating}>
              {t("features.updater.skipVersion", "Skip This Version")}
            </Button>
            <Button variant="default" onClick={handleDismiss} disabled={isUpdating}>
              {t("features.updater.remindLater", "Remind Me Later")}
            </Button>
          </Group>

          <Button
            leftSection={<IconDownload size={16} />}
            onClick={handleUpdate}
            loading={isUpdating}
            disabled={isUpdating}
          >
            {isUpdating ? t("features.updater.updating", "Updating...") : t("features.updater.updateNow", "Update Now")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function showUpdateNotification(versionInfo: VersionInfo, onUpdate: () => void, onViewDetails: () => void) {
  const notificationId = `update-${versionInfo.version}`;

  notifications.show({
    id: notificationId,
    title: "New Version Available",
    message: (
      <Stack gap="xs">
        <Text size="sm">Version {versionInfo.version} is ready to install</Text>
        <Group gap="xs">
          <Button
            size="xs"
            variant="subtle"
            onClick={() => {
              notifications.hide(notificationId);
              onViewDetails();
            }}
          >
            Details
          </Button>
          <Button
            size="xs"
            onClick={() => {
              notifications.hide(notificationId);
              onUpdate();
            }}
          >
            Update
          </Button>
        </Group>
      </Stack>
    ),
    autoClose: false,
    withCloseButton: true,
    icon: <IconInfoCircle size={20} />,
    color: "blue",
  });
}

export function showUpdateProgressNotification() {
  return notifications.show({
    id: "update-progress",
    title: "Updating Application",
    message: "Downloading and installing update...",
    loading: true,
    autoClose: false,
    withCloseButton: false,
  });
}

export function showUpdateSuccessNotification() {
  notifications.show({
    title: "Update Completed",
    message: "The application will restart to apply the update",
    color: "green",
    autoClose: 3000,
  });
}

export function showUpdateErrorNotification(error: string) {
  notifications.show({
    title: "Update Failed",
    message: error,
    color: "red",
    autoClose: 10000,
    withCloseButton: true,
    icon: <IconX size={20} />,
  });
}

export function hideUpdateProgressNotification() {
  notifications.hide("update-progress");
}
