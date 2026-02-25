import { Stack, Paper, Text, Code, Button, Group, SimpleGrid, Kbd } from "@mantine/core";
import { IconBulb, IconChartBar, IconPlayerSkipForward, IconRefresh } from "@tabler/icons-react";
import { FC } from "react";

interface SidebarDataProps {
    objective: {
        title: string;
        description: string;
        turns?: "white" | "black";
    };
    moveHistory: string[];
    stats: {
        timeSeconds: number;
        attempts: number;
    };
    actions: {
        onHint: () => void;
        onAnalyze: () => void;
        onSkip: () => void;
        onReset: () => void;
    };
}

export const SidebarData: FC<SidebarDataProps> = ({
    objective,
    moveHistory,
    stats,
    actions,
}) => {
    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    };

    return (
        <Stack gap="md" h="100%">
            
            <Paper withBorder p="md" radius="md">
                <Text size="xs" c="dimmed" mb="xs" fw={700} tt="uppercase">
                    Objective
                </Text>
                <Text size="lg" fw={700} lineClamp={2}>
                    {objective.title}
                </Text>
                <Text size="sm" c="dimmed" mt="xs" lineClamp={3}>
                    {objective.description}
                </Text>
                {objective.turns && (
                    <Text size="xs" fw={600} mt="sm" color={objective.turns === "white" ? "gray.4" : "dark.4"}>
                        {objective.turns === "white" ? "⚪ White to move" : "⚫ Black to move"}
                    </Text>
                )}
            </Paper>

            
            <Paper withBorder p="md" radius="md" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <Text size="xs" c="dimmed" mb="xs" fw={700} tt="uppercase">
                    Move History
                </Text>
                <Paper
                    bg="var(--mantine-color-dark-8)"
                    p="sm"
                    radius="sm"
                    style={{ flex: 1, overflowY: "auto", minHeight: 100 }}
                >
                    {moveHistory.length > 0 ? (
                        <Code block bg="transparent" c="gray.4" style={{ fontFamily: "var(--mantine-font-family-monospace)" }}>
                            {moveHistory.map((m, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${m} ` : `${m}\n`)).join("")}
                        </Code>
                    ) : (
                        <Text size="sm" c="dimmed" fs="italic">
                            No moves played yet.
                        </Text>
                    )}
                </Paper>
            </Paper>

            
            <Paper withBorder p="md" radius="md">
                <SimpleGrid cols={2}>
                    <div>
                        <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                            Time
                        </Text>
                        <Text size="lg" fw={700} ff="monospace">
                            {formatTime(stats.timeSeconds)}
                        </Text>
                    </div>
                    <div>
                        <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                            Attempts
                        </Text>
                        <Text size="lg" fw={700} ff="monospace">
                            {stats.attempts}
                        </Text>
                    </div>
                </SimpleGrid>
            </Paper>

            
            <Stack gap="xs">
                <Button
                    fullWidth
                    size="md"
                    variant="light"
                    color="yellow"
                    leftSection={<IconBulb size={18} />}
                    onClick={actions.onHint}
                    justify="space-between"
                    rightSection={<Kbd size="xs">H</Kbd>}
                >
                    Show Hint
                </Button>
                <Button
                    fullWidth
                    size="md"
                    variant="light"
                    color="blue"
                    leftSection={<IconChartBar size={18} />}
                    onClick={actions.onAnalyze}
                    justify="space-between"
                    rightSection={<Kbd size="xs">A</Kbd>}
                >
                    Analyze Position
                </Button>
                <Group grow gap="xs">
                    <Button
                        variant="default"
                        leftSection={<IconRefresh size={16} />}
                        onClick={actions.onReset}
                        rightSection={<Kbd size="xs">R</Kbd>}
                    >
                        Reset
                    </Button>
                    <Button
                        variant="default"
                        leftSection={<IconPlayerSkipForward size={16} />}
                        onClick={actions.onSkip}
                        rightSection={<Kbd size="xs">S</Kbd>}
                    >
                        Skip
                    </Button>
                </Group>
            </Stack>
        </Stack>
    );
};
