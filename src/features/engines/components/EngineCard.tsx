import { Badge, Box, Group, Stack, Text } from "@mantine/core";
import { IconCloud, IconCpu } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { memo } from "react";
import { commands } from "@/bindings";
import * as classes from "@/components/GenericCard.css";
import LocalImage from "@/components/LocalImage";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import type { Engine } from "@/utils/engines";

interface EngineCardProps {
  engine: Engine;
  stats?: { label: string; value: string }[];
}

export const EngineCard = memo(function EngineCard({ engine, stats }: EngineCardProps) {
  const { layout } = useResponsiveLayout();
  const isMobile = layout.engines.layoutType === "mobile";
  const { data: fileExists, isLoading } = useQuery({
    queryKey: ["file-exists", engine.type === "local" ? engine.path : null],
    queryFn: async () => {
      const path = engine.type === "local" ? engine.path : null;
      if (path === null) return false;
      if (engine.type !== "local") return true;
      const res = await commands.fileExists(path);
      return res.status === "ok";
    },
    enabled: engine.type === "local",
    staleTime: Infinity,
  });

  const hasError = engine.type === "local" && !isLoading && !fileExists;

  return (
    <Group>
      <Box flex="1">
        {engine.image ? (
          <LocalImage src={engine.image} alt={engine.name} h={isMobile ? "100px" : "135px"} />
        ) : engine.type !== "local" ? (
          <IconCloud size={isMobile ? "100px" : "135px"} />
        ) : (
          <IconCpu size={isMobile ? "100px" : "135px"} />
        )}
      </Box>

      <Stack flex="1" gap={0}>
        <Stack gap="xs">
          <Group align="center" gap="xs" wrap="wrap">
            <Text fw="bold" lineClamp={1} c={hasError ? "red" : undefined} size={isMobile ? "sm" : "md"}>
              {engine.name} {hasError ? "(file missing)" : ""}
            </Text>
            {engine.type === "local" && engine.version && (
              <Badge size="xs" variant="light" color="teal">
                v{engine.version}
              </Badge>
            )}
          </Group>
          <Group>
            {!!engine.loaded && (
              <Badge size="xs" variant="outline" color="green">
                Enabled
              </Badge>
            )}
            <Badge size="xs" variant="light" color={engine.type === "local" ? "blue" : "grape"}>
              {engine.type === "local" ? "Local" : "Cloud"}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed" style={{ wordWrap: "break-word" }} lineClamp={1}>
            {engine.type === "local" ? engine.path.split(/\/|\\/).slice(-1)[0] : engine.url}
          </Text>
        </Stack>

        <Group justify="space-between">
          {stats?.map((stat) => (
            <Stack key={stat.label} gap="0" align="center">
              <Text size="xs" c="dimmed" fw="bold" className={classes.label} mt={isMobile ? "0.5rem" : "1rem"}>
                {stat.label}
              </Text>
              <Text fw={700} size={isMobile ? "md" : "lg"} style={{ lineHeight: 1 }}>
                {stat.value}
              </Text>
            </Stack>
          ))}
        </Group>
      </Stack>
    </Group>
  );
});
