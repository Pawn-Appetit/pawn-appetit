import { Box, Stack } from "@mantine/core";
import cx from "clsx";
import type { ReactNode } from "react";
import * as classes from "./GenericCard.css";

type Props<T> = {
  id: T;
  isSelected: boolean;
  setSelected: (id: T) => void;
  error?: string;
  stats?: {
    label: string;
    value: string;
  }[];
  content: ReactNode;
  onDoubleClick?: () => void;
};

export default function GenericCard<T>({ id, isSelected, setSelected, error, content, onDoubleClick }: Props<T>) {
  return (
    <Box
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") setSelected(id);
      }}
      className={cx(classes.card, {
        [classes.selected]: isSelected,
        [classes.error]: !!error,
      })}
      onClick={() => setSelected(id)}
      onDoubleClick={onDoubleClick}
    >
      <Stack h="100%" justify="space-between">
        {content}
      </Stack>
    </Box>
  );
}
