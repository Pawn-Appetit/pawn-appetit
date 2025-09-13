import { Box, Menu, UnstyledButton } from "@mantine/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Sides } from "@/utils/db";
import * as classes from "./SideInput.css";

type SideInputProps = {
  selectingFor: "player" | "opponent";
  sides: Sides;
  setSides: (val: Sides) => void;
};

export function SideInput({ selectingFor, sides, setSides }: SideInputProps) {
  const { t } = useTranslation();

  const data = useMemo(
    () => [
      { label: t("chess.white"), color: "white" as const },
      { label: t("chess.black"), color: "black" as const },
      { label: t("chess.any"), color: "gray" as const },
    ],
    [t],
  );

  // Derive selected from sides prop
  const selected = useMemo(() => {
    if (
      (sides === "WhiteBlack" && selectingFor === "player") ||
      (sides === "BlackWhite" && selectingFor === "opponent")
    ) {
      return data[0];
    } else if (sides === "Any") {
      return data[2];
    } else {
      return data[1];
    }
  }, [sides, selectingFor, data]);

  const handleSelect = (item: (typeof data)[0]) => {
    if (
      (item.color === "white" && selectingFor === "player") ||
      (item.color === "black" && selectingFor === "opponent")
    ) {
      setSides("WhiteBlack");
    } else if (item.color === "gray") {
      setSides("Any");
    } else {
      setSides("BlackWhite");
    }
  };

  const items = data.map((item) => (
    <Menu.Item
      leftSection={
        <Box
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            display: "inline-block",
            backgroundColor: item.color,
          }}
        />
      }
      onClick={() => handleSelect(item)}
      key={item.color}
    >
      {item.label}
    </Menu.Item>
  ));

  return (
    <Menu>
      <Menu.Target>
        <UnstyledButton className={classes.control}>
          <Box
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              display: "inline-block",
              backgroundColor: selected.color,
            }}
          />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>{items}</Menu.Dropdown>
    </Menu>
  );
}
