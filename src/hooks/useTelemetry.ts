import { useCallback, useEffect, useState } from "react";
import { commands } from "@/bindings";

export interface TelemetryConfig {
  enabled: boolean;
  initial_run_completed: boolean;
}

export const useTelemetry = () => {
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadTelemetryState = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const enabled = await commands.getTelemetryEnabled();
      if (enabled.status === "ok") {
        setIsEnabled(enabled.data);
      } else {
        setError(enabled.error);
      }
    } catch (err) {
      setError(`Failed to load telemetry settings: ${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleTelemetry = useCallback(async (enabled: boolean) => {
    try {
      setError(null);
      const result = await commands.setTelemetryEnabled(enabled);
      if (result.status === "ok") {
        setIsEnabled(enabled);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(`Failed to update telemetry settings: ${err}`);
    }
  }, []);

  const getTelemetryConfig = useCallback(async (): Promise<TelemetryConfig | null> => {
    try {
      const result = await commands.getTelemetryConfig();
      if (result.status === "ok") {
        return result.data;
      } else {
        setError(result.error);
        return null;
      }
    } catch (err) {
      setError(`Failed to get telemetry config: ${err}`);
      return null;
    }
  }, []);

  useEffect(() => {
    loadTelemetryState();
  }, [loadTelemetryState]);

  return {
    isEnabled,
    loading,
    error,
    toggleTelemetry,
    getTelemetryConfig,
    refresh: loadTelemetryState,
  };
};
