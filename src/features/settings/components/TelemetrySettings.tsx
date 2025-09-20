import { Alert, Group, Loader, Switch, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import type React from "react";
import { useTelemetry } from "@/hooks/useTelemetry";

interface TelemetrySettingsProps {
  className?: string;
}

export const TelemetrySettings: React.FC<TelemetrySettingsProps> = ({ className }) => {
  const { isEnabled, loading, error, toggleTelemetry } = useTelemetry();

  const handleTelemetryToggle = (checked: boolean) => {
    toggleTelemetry(checked);
  };

  if (loading) {
    return (
      <Group justify="space-between" wrap="nowrap" gap="xl" className={className}>
        <div>
          <Text>Telemetry</Text>
          <Text size="xs" c="dimmed">
            Loading telemetry settings...
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
          <Text>Telemetry</Text>
          <Text size="xs" c="dimmed">
            Help improve Pawn Appétit by sharing anonymous usage data
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
        Telemetry data is anonymous and helps us understand how Pawn Appétit is used to improve the experience. We never
        collect personal information or game content. Data is securely stored using Supabase.
      </Alert>
    </div>
  );
};

export default TelemetrySettings;
