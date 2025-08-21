import { Text } from "@mantine/core";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { getOpening } from "@/utils/chess";
import { TreeStateContext } from "./TreeStateContext";

function OpeningName() {
  const [openingName, setOpeningName] = useState("");
  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const position = useStore(store, (s) => s.position);
  const { t } = useTranslation();

  useEffect(() => {
    getOpening(root, position).then((v) => setOpeningName(v));
  }, [root, position]);

  return (
    <Text style={{ userSelect: "text" }} fz="sm" h="1.5rem">
      {openingName === "Empty Board"
        ? t("Opening.EmptyBoard")
        : openingName === "Starting Position"
          ? t("Opening.StartingPosition")
          : openingName}
    </Text>
  );
}

export default OpeningName;
