import { ActionIcon, Breadcrumbs, Group, Text, Progress, Box } from "@mantine/core";
import { IconArrowBackUp } from "@tabler/icons-react";
import { FC } from "react";

interface ExerciseHeaderProps {
    categoryTitle: string;
    progress: {
        completed: number;
        total: number;
    };
    onBack: () => void;
}

export const ExerciseHeader: FC<ExerciseHeaderProps> = ({ categoryTitle, progress, onBack }) => {
    const currentProgress = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

    return (
        <Group justify="space-between" align="center" mb="lg">
            <Group>
                <ActionIcon
                    variant="light"
                    size="lg"
                    onClick={onBack}
                    aria-label="Back to Hub"
                    title="Back to Hub"
                >
                    <IconArrowBackUp size={20} />
                </ActionIcon>

                <Breadcrumbs separator="→">
                    <Text size="sm" c="dimmed">Training</Text>
                    <Text size="sm" fw={600}>{categoryTitle}</Text>
                </Breadcrumbs>
            </Group>

            <Box w={150}>
                <Group justify="space-between" mb={4}>
                    <Text size="xs" fw={500}>Progress</Text>
                    <Text size="xs" c="dimmed">{progress.completed}/{progress.total}</Text>
                </Group>
                <Progress value={currentProgress} size="sm" radius="xl" />
            </Box>
        </Group>
    );
};
