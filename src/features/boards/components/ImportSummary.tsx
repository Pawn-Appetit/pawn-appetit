import { Alert, Badge, Box, Collapse, Group, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface ImportResult {
  successCount: number;
  totalGames: number;
  errors: { file?: string; error: string }[];
  failedGames?: { gameIndex: number; error: string; fileName?: string }[];
  importedFiles?: { path: string; name: string; gameCount: number }[];
}

interface ImportSummaryProps {
  result: ImportResult;
  onClose?: () => void;
}

export function ImportSummary({ result }: ImportSummaryProps) {
  const { t } = useTranslation();
  const [showErrors, setShowErrors] = useState(false);

  const hasErrors = result.errors.length > 0 || (result.failedGames?.length || 0) > 0;
  const allSuccess = result.successCount === result.totalGames && !hasErrors;

  return (
    <Stack gap="md">
      <Alert
        icon={
          allSuccess ? <IconCheck size={16} /> : hasErrors ? <IconAlertTriangle size={16} /> : <IconCheck size={16} />
        }
        color={allSuccess ? "green" : hasErrors ? "yellow" : "green"}
        title={t("features.tabs.importGame.importComplete")}
      >
        <Stack gap="xs">
          <Group>
            <Badge color="green" variant="filled">
              {result.successCount === 1 &&
                t("features.tabs.importGame.gamesImported.one", { count: result.successCount })}
              {result.successCount > 1 &&
                t("features.tabs.importGame.gamesImported.other", { count: result.successCount })}
            </Badge>

            {hasErrors && (
              <Badge color="red" variant="filled">
                {result.errors.length + (result.failedGames?.length || 0) === 1 &&
                  t("features.tabs.importGame.errorCount.one", {
                    count: result.errors.length + (result.failedGames?.length || 0),
                  })}
                {result.errors.length + (result.failedGames?.length || 0) > 1 &&
                  t("features.tabs.importGame.errorCount.other", {
                    count: result.errors.length + (result.failedGames?.length || 0),
                  })}
              </Badge>
            )}
          </Group>

          <Text size="sm">
            {allSuccess
              ? t("features.tabs.importGame.allGamesImported")
              : t("features.tabs.importGame.partialImport", {
                  imported: result.successCount,
                  total: result.totalGames,
                })}
          </Text>
        </Stack>
      </Alert>

      {/* Show imported files */}
      {result.importedFiles && result.importedFiles.length > 0 && (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            {t("features.tabs.importGame.importedFiles")}
          </Text>
          {result.importedFiles.map((file) => (
            <Group
              key={`imported-file-${file.path}-${file.name}`}
              justify="space-between"
              p="sm"
              style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: "var(--mantine-radius-sm)" }}
            >
              <Box>
                <Text size="sm" fw={500}>
                  {file.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {file.gameCount === 1 && t("common.games.one", { count: file.gameCount })}
                  {file.gameCount > 1 && t("common.games.other", { count: file.gameCount })}
                </Text>
              </Box>
            </Group>
          ))}
        </Stack>
      )}

      {hasErrors && (
        <Box>
          <Text size="sm" c="dimmed" style={{ cursor: "pointer" }} onClick={() => setShowErrors(!showErrors)}>
            {showErrors ? "▼" : "▶"} {t("features.tabs.importGame.showErrors")}
          </Text>

          <Collapse in={showErrors}>
            <Stack gap="xs" mt="xs">
              {result.errors.map((error, index) => (
                <Alert key={`file-error-${error.file || "unknown"}-${index}`} color="red" variant="light">
                  <Text size="sm" fw={500}>
                    {error.file
                      ? t("features.tabs.importGame.fileError", { file: error.file })
                      : t("features.tabs.importGame.generalError")}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {error.error}
                  </Text>
                </Alert>
              ))}

              {result.failedGames?.map((failedGame, index) => (
                <Alert key={`game-error-${failedGame.gameIndex}-${index}`} color="red" variant="light">
                  <Text size="sm" fw={500}>
                    {failedGame.fileName
                      ? `${failedGame.fileName} - ${t("features.tabs.importGame.gameError", { gameIndex: failedGame.gameIndex + 1 })}`
                      : t("features.tabs.importGame.gameError", { gameIndex: failedGame.gameIndex + 1 })}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {failedGame.error}
                  </Text>
                </Alert>
              ))}
            </Stack>
          </Collapse>
        </Box>
      )}
    </Stack>
  );
}
