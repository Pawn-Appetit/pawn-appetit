import { SegmentedControl } from "@mantine/core";
import { IconLayoutGrid, IconTable } from "@tabler/icons-react";

export type ViewType = "grid" | "table";

interface ViewToggleProps {
  value: ViewType;
  onChange: (value: ViewType) => void;
}

function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <SegmentedControl
      value={value}
      onChange={(v) => onChange(v as ViewType)}
      data={[
        {
          value: "grid",
          label: (
            <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <IconLayoutGrid size="1rem" />
              Grid
            </span>
          ),
        },
        {
          value: "table",
          label: (
            <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <IconTable size="1rem" />
              Table
            </span>
          ),
        },
      ]}
    />
  );
}

export default ViewToggle;
