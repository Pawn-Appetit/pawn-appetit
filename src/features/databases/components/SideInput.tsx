import { Box, Menu, UnstyledButton } from "@mantine/core";
import { useEffect, useState } from "react";
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
  const data: { label: string; color: "white" | "black" | "gray" }[] = [
    { label: t("Common.White"), color: "white" },
    { label: t("Common.Black"), color: "black" },
    { label: t("Common.Any"), color: "gray" },
  ];

  const [selected, setSelected] = useState(
    (sides === "WhiteBlack" && selectingFor === "player") || (sides === "BlackWhite" && selectingFor === "opponent")
      ? data[0]
      : sides === "Any"
        ? data[2]
        : data[1],
  );
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
      onClick={() => setSelected(item)}
      key={item.color}
    >
      {item.label}
    </Menu.Item>
  ));

  useEffect(() => {
    if (
      (selected.color === "white" && selectingFor === "player") ||
      (selected.color === "black" && selectingFor === "opponent")
    ) {
      setSides("WhiteBlack");
    } else if (selected.color === "gray") {
      setSides("Any");
    } else {
      setSides("BlackWhite");
    }
  }, [selected, selectingFor]);

  useEffect(() => {
    const newSelected =
      (sides === "WhiteBlack" && selectingFor === "player") || (sides === "BlackWhite" && selectingFor === "opponent")
        ? data[0]
        : sides === "Any"
          ? data[2]
          : data[1];
    setSelected(newSelected);
  }, [sides, selectingFor]);

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
