import { Table, Progress, Badge, ActionIcon, Group, Text } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import { FC } from "react";
import { PracticeCategory } from "../../constants/practices";

interface CategoryTableProps {
    categories: PracticeCategory[];
    statsMap: Record<string, { completed: number; total: number; nextExerciseTitle?: string }>;
    onSelectCategory: (categoryId: string) => void;
}

export const CategoryTable: FC<CategoryTableProps> = ({
    categories,
    statsMap,
    onSelectCategory,
}) => {
    const rows = categories.map((category) => {
        const stats = statsMap[category.id] || { completed: 0, total: category.exercises.length };
        const progressPercent = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
        const isCompleted = stats.completed === stats.total && stats.total > 0;
        const color = isCompleted ? "green" : category.color || "blue";

        return (
            <Table.Tr key={category.id} style={{ cursor: "pointer" }} onClick={() => onSelectCategory(category.id)}>
                <Table.Td>
                    <Group gap="sm" wrap="nowrap">
                        <Text fw={600} size="sm">{category.title}</Text>
                    </Group>
                </Table.Td>
                <Table.Td>
                    <Badge size="sm" variant="outline" color={color}>
                        {category.group}
                    </Badge>
                </Table.Td>
                <Table.Td>
                    <Group gap="xs" wrap="nowrap" align="center">
                        <Text size="sm" fw={500} w={40} ta="right">
                            {stats.completed}/{stats.total}
                        </Text>
                        <Progress value={progressPercent} color={color} style={{ flex: 1, minWidth: 60 }} />
                    </Group>
                </Table.Td>
                <Table.Td>
                    <Text size="sm" c="dimmed" lineClamp={1}>
                        {isCompleted ? "Complete" : stats.nextExerciseTitle || "Ready"}
                    </Text>
                </Table.Td>
                <Table.Td style={{ width: 60 }}>
                    <ActionIcon color={color} variant="light">
                        <IconArrowRight size={16} />
                    </ActionIcon>
                </Table.Td>
            </Table.Tr>
        );
    });

    return (
        <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>MODULE</Table.Th>
                    <Table.Th>CATEGORY</Table.Th>
                    <Table.Th>PROGRESS</Table.Th>
                    <Table.Th>STATUS</Table.Th>
                    <Table.Th></Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{rows}</Table.Tbody>
        </Table>
    );
};
