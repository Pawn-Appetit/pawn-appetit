import { Badge, Box, Button, Card, Container, Group, Stack, Text, Title } from "@mantine/core";
import { IconArrowRight, IconFlame } from "@tabler/icons-react";
import { FC } from "react";
import { PracticeCategory } from "../../constants/practices";
import classes from "./HeroSection.module.css";

interface HeroSectionProps {
    currentStreak: number;
    overallProgress: number;
    mostRecentCategory: PracticeCategory | null;
    categoryProgress: { completed: number; total: number } | null;
    nextExerciseTitle?: string;
    onContinueAction: () => void;
}

export const HeroSection: FC<HeroSectionProps> = ({
    currentStreak,
    overallProgress,
    mostRecentCategory,
    categoryProgress,
    nextExerciseTitle,
    onContinueAction,
}) => {
    return (
        <Card shadow="sm" radius="lg" p="xl" withBorder className={classes.heroCard} mt="md">
            <Stack gap="xl">
                
                <Group justify="space-between" align="center">
                    <Box>
                        <Title order={1} size="h2" mb={4}>
                            Train Your Analysis Skills
                        </Title>
                        <Text c="dimmed" size="lg">
                            Master endgames, tactics, and positional patterns
                        </Text>
                    </Box>

                    <Group gap="md">
                        <Badge size="xl" variant="light" color="orange" leftSection={<IconFlame size={16} />}>
                            {currentStreak} day streak
                        </Badge>
                        <Badge size="xl" variant="filled" color="blue">
                            {Math.round(overallProgress)}% Complete
                        </Badge>
                    </Group>
                </Group>

                
                {mostRecentCategory && categoryProgress && (
                    <Card withBorder radius="md" p="md" className={classes.ctaCard}>
                        <Group justify="space-between" wrap="nowrap">
                            <Stack gap="xs" style={{ flex: 1 }}>
                                <Group gap="md">
                                    <Text fw={600} size="md">
                                        {mostRecentCategory.title}
                                    </Text>
                                    <Text c="dimmed" size="sm">
                                        {categoryProgress.completed}/{categoryProgress.total} ✓
                                    </Text>
                                </Group>
                                {nextExerciseTitle && (
                                    <Text size="sm" fw={500} c="blue">
                                        Next: {nextExerciseTitle}
                                    </Text>
                                )}
                            </Stack>
                            <Button
                                size="md"
                                variant="filled"
                                color="blue"
                                rightSection={<IconArrowRight size={18} />}
                                onClick={onContinueAction}
                                style={{ minWidth: 200 }}
                            >
                                Continue Training
                            </Button>
                        </Group>
                    </Card>
                )}
            </Stack>
        </Card>
    );
};
