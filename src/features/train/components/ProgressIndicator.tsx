import { Progress, Tooltip } from "@mantine/core";

interface LinearProgressProps {
  completed: number;
  total: number;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  tooltipLabel?: string;
  width?: number;
}

export function LinearProgress({ completed, total, size = "md", tooltipLabel, width = 200 }: LinearProgressProps) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  const isComplete = percentage === 100;

  const defaultTooltip = `${Math.round(percentage)}% complete`;

  return (
    <Tooltip label={tooltipLabel || defaultTooltip}>
      <Progress value={percentage} size={size} radius="xl" style={{ width }} color={isComplete ? "green" : "blue"} />
    </Tooltip>
  );
}
