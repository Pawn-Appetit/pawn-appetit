import { Badge, Box, Button, Card, Group, RingProgress, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import { FC } from "react";
import { PracticeCategory, uiConfig } from "../../constants/practices";
import classes from "./CategoryCard.module.css";

interface CategoryCardProps {
    category: PracticeCategory;
    progress: {
        completed: number;
        total: number;
    };
    onContinue: () => void;
    nextExerciseTitle?: string;
}

export const CategoryCard: FC<CategoryCardProps> = ({
    category,
    progress,
    onContinue,
    nextExerciseTitle,
}) => {
    const progressPercent = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
    const isCompleted = progress.completed === progress.total && progress.total > 0;
    const color = isCompleted ? "green" : category.color || "blue";

    return (
        <Card shadow="sm" radius="md" withBorder className={classes.card} onClick={onContinue}>
            <Stack gap="sm" h="100%">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Box style={{ flex: 1 }}>
                        <Group gap="xs" mb={4}>
                            <Text fw={700} size="lg" lineClamp={1}>
                                {category.title}
                            </Text>
                            <Badge size="sm" variant="light" color={color}>
                                {category.group}
                            </Badge>
                        </Group>
                        <Text size="sm" c="dimmed" lineClamp={2}>
                            {category.description}
                        </Text>
                    </Box>
                    <RingProgress
                        size={60}
                        thickness={6}
                        roundCaps
                        sections={[{ value: progressPercent, color }]}
                        label={
                            <Text c="dimmed" fw={700} ta="center" size="xs">
                                {progressPercent.toFixed(0)}%
                            </Text>
                        }
                    />
                </Group>

                <Group justify="space-between" align="flex-end" mt="auto">
                    <Box>
                        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                            Remaining
                        </Text>
                        {isCompleted ? (
                            <Text size="sm" c="green" fw={500}>
                                Category Complete ✓
                            </Text>
                        ) : (
                            <Text size="sm" fw={500} lineClamp={1}>
                                {progress.total - progress.completed} exercises
                                {nextExerciseTitle && ` • Next: ${nextExerciseTitle}`}
                            </Text>
                        )}
                    </Box>

                    <Button
                        size="sm"
                        variant="light"
                        color={color}
                        radius="md"
                        onClick={(e) => {
                            e.stopPropagation();
                            onContinue();
                        }}
                        rightSection={<IconArrowRight size={16} />}
                    >
                        {progress.completed === 0
                            ? "Start"
                            : isCompleted
                                ? "Review"
                                : "Continue"}
                    </Button>
                </Group>
            </Stack>
        </Card>
    );
};
