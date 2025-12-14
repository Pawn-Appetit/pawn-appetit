import type { Color } from "@lichess-org/chessground/types";
import { Box, Text, Tooltip, useMantineTheme } from "@mantine/core";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import type { ScoreValue } from "@/bindings";
import { currentThemeIdAtom } from "@/features/themes/state/themeAtoms";
import { getWinChance } from "@/utils/score";

function EvalBar({ score, orientation }: { score: ScoreValue | null; orientation: Color }) {
  const theme = useMantineTheme();
  const { t } = useTranslation();
  const currentThemeId = useAtomValue(currentThemeIdAtom);
  
  // Colors for Academia Maya theme - more contrasting
  const isAcademiaMaya = currentThemeId === "academia-maya";
  const blackColor = isAcademiaMaya ? "#1a1a1a" : theme.colors.dark[4];
  const whiteColor = isAcademiaMaya ? "#f5ead5" : theme.colors.gray[2];
  const blackTextColor = isAcademiaMaya ? "#f5ead5" : theme.colors.gray[2];
  const whiteTextColor = isAcademiaMaya ? "#1a1a1a" : theme.colors.dark[8];

  let ScoreBars = [
    <Box
      key="black"
      style={{
        height: "100%",
        backgroundColor: blackColor,
        transition: "height 0.2s ease",
        display: "flex",
        flexDirection: "column",
      }}
    />,
  ];

  if (score) {
    const progress = score.type === "cp" ? getWinChance(score.value) : score.value > 0 ? 100 : 0;

    ScoreBars = [
      <Box
        key="black"
        style={{
          height: `${100 - progress}%`,
          backgroundColor: blackColor,
          transition: "height 0.2s ease",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Text fz="xs" c={blackTextColor} ta="center" py={3} mt={orientation === "black" ? "auto" : undefined}>
          {score.value <= 0 && t("units.score", { score, precision: 1 }).replace(/\+|-/, "")}
        </Text>
      </Box>,
      <Box
        key="white"
        style={{
          height: `${progress}%`,
          backgroundColor: whiteColor,
          transition: "height 0.2s ease",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Text fz="xs" py={3} c={whiteTextColor} ta="center" mt={orientation === "white" ? "auto" : undefined}>
          {score.value > 0 && t("units.score", { score, precision: 1 }).slice(1)}
        </Text>
      </Box>,
    ];
  }

  if (orientation === "black") {
    ScoreBars = ScoreBars?.reverse();
  }

  return (
    <Tooltip
      position="right"
      color={score && score.value < 0 ? "dark" : undefined}
      label={score ? t("units.score", { score }) : undefined}
      disabled={!score}
    >
      <Box
        style={{
          width: 25,
          height: "100%",
          borderRadius: "var(--mantine-radius-xs)",
          overflow: "hidden",
        }}
      >
        {ScoreBars}
      </Box>
    </Tooltip>
  );
}

export default EvalBar;
