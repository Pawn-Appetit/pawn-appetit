import { Alert, Group, Loader, Switch, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import type React from "react";
import { useTranslation } from "react-i18next";
import { useTelemetry } from "@/hooks/useTelemetry";

interface TelemetrySettingsProps {
  className?: string;
}

export const TelemetrySettings: React.FC<TelemetrySettingsProps> = ({ className }) => {
  const { t } = useTranslation();
  const { isEnabled, loading, error, toggleTelemetry } = useTelemetry();

  const handleTelemetryToggle = (checked: boolean) => {
    toggleTelemetry(checked);
  };

  if (loading) {
    return (
      <Group justify="space-between" wrap="nowrap" gap="xl" className={className}>
        <div>
          <Text>{t("settings.telemetry")}</Text>
          <Text size="xs" c="dimmed">
            {t("settings.telemetryLoading")}
          </Text>
        </div>
        <Loader size="sm" />
      </Group>
    );
  }

  return (
    <div>
      <Group justify="space-between" wrap="nowrap" gap="xl" className={className}>
        <div>
          <Text>{t("settings.telemetry")}</Text>
          <Text size="xs" c="dimmed">
            {t("settings.telemetryDesc")}
          </Text>
        </div>
        <Switch
          checked={isEnabled}
          onChange={(event) => handleTelemetryToggle(event.currentTarget.checked)}
          disabled={loading}
        />
      </Group>

      {error && (
        <Alert icon={<IconInfoCircle size={16} />} color="red" mt="xs">
          {error}
        </Alert>
      )}

      <Alert icon={<IconInfoCircle size={16} />} color="blue" mt="xs">
        {t("settings.telemetryDetails")}
      </Alert>
    </div>
  );
};

export default TelemetrySettings;
