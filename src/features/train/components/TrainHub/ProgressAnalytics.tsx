import { Paper, SimpleGrid, Group, Text, RingProgress, Stack } from "@mantine/core";
import { IconTarget, IconActivity, IconClockHour4, IconFlame } from "@tabler/icons-react";
import { FC } from "react";

interface ProgressAnalyticsProps {
    totalExercises: number;
    completedExercises: number;
    accuracy: number;
    totalTimeMinutes: number;
}

export const ProgressAnalytics: FC<ProgressAnalyticsProps> = ({
    totalExercises,
    completedExercises,
    accuracy,
    totalTimeMinutes,
}) => {
    const completionPercent = totalExercises > 0 ? (completedExercises / totalExercises) * 100 : 0;

    return (
        <Stack gap="md">
            <Text fw={700} size="xl">
                Training Overview
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
                <Paper withBorder p="md" radius="md">
                    <Group justify="space-between" align="center" mb="xs">
                        <Text size="sm" c="dimmed" fw={600} tt="uppercase">
                            Progress
                        </Text>
                        <IconTarget size={20} stroke={1.5} color="var(--mantine-color-blue-6)" />
                    </Group>
                    <Group align="flex-end" gap="xs">
                        <Text size="xl" fw={700} ff="monospace">
                            {completedExercises}
                        </Text>
                        <Text size="sm" c="dimmed" mb={4}>
                            / {totalExercises}
                        </Text>
                    </Group>
                    <RingProgress
                        size={40}
                        thickness={4}
                        roundCaps
                        sections={[{ value: completionPercent, color: "blue" }]}
                        style={{ position: "absolute", top: 12, right: 12, opacity: 0.2 }}
                    />
                </Paper>

                <Paper withBorder p="md" radius="md">
                    <Group justify="space-between" align="center" mb="xs">
                        <Text size="sm" c="dimmed" fw={600} tt="uppercase">
                            Accuracy
                        </Text>
                        <IconActivity size={20} stroke={1.5} color="var(--mantine-color-teal-6)" />
                    </Group>
                    <Group align="flex-end" gap="xs">
                        <Text size="xl" fw={700} ff="monospace">
                            {accuracy}%
                        </Text>
                    </Group>
                </Paper>

                <Paper withBorder p="md" radius="md">
                    <Group justify="space-between" align="center" mb="xs">
                        <Text size="sm" c="dimmed" fw={600} tt="uppercase">
                            Time Trained
                        </Text>
                        <IconClockHour4 size={20} stroke={1.5} color="var(--mantine-color-grape-6)" />
                    </Group>
                    <Group align="flex-end" gap="xs">
                        <Text size="xl" fw={700} ff="monospace">
                            {totalTimeMinutes}m
                        </Text>
                    </Group>
                </Paper>

                <Paper withBorder p="md" radius="md">
                    <Group justify="space-between" align="center" mb="xs">
                        <Text size="sm" c="dimmed" fw={600} tt="uppercase">
                            Effort Level
                        </Text>
                        <IconFlame size={20} stroke={1.5} color="var(--mantine-color-orange-6)" />
                    </Group>
                    <Group align="flex-end" gap="xs">
                        <Text size="xl" fw={700}>
                            High
                        </Text>
                    </Group>
                </Paper>
            </SimpleGrid>
        </Stack>
    );
};
