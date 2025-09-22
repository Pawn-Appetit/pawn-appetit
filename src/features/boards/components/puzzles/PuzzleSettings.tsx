import { Center, Checkbox, Divider, Group, Input, RangeSlider, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { PuzzleDatabaseInfo } from "@/bindings";

interface PuzzleSettingsProps {
  puzzleDbs: PuzzleDatabaseInfo[];
  selectedDb: string | null;
  onDatabaseChange: (value: string | null) => void;
  ratingRange: [number, number];
  onRatingRangeChange: (value: [number, number]) => void;
  minRating: number;
  maxRating: number;
  dbRatingRange: [number, number] | null;
  progressive: boolean;
  onProgressiveChange: (value: boolean) => void;
  hideRating: boolean;
  onHideRatingChange: (value: boolean) => void;
  inOrder: boolean;
  onInOrderChange: (value: boolean) => void;
}

export const PuzzleSettings = ({
  puzzleDbs,
  selectedDb,
  onDatabaseChange,
  ratingRange,
  onRatingRangeChange,
  minRating,
  maxRating,
  dbRatingRange,
  progressive,
  onProgressiveChange,
  hideRating,
  onHideRatingChange,
  inOrder,
  onInOrderChange,
}: PuzzleSettingsProps) => {
  const { t } = useTranslation();

  const isProgressiveDisabled = !dbRatingRange || (dbRatingRange && dbRatingRange[0] === dbRatingRange[1]);
  const isProgressiveChecked = dbRatingRange && dbRatingRange[0] === dbRatingRange[1] ? false : progressive;

  return (
    <>
      <Select
        data={puzzleDbs
          .map((p) => ({
            label: p.title.split(".db3")[0],
            value: p.path,
          }))
          .concat({ label: `+ ${t("common.addNew")}`, value: "add" })}
        value={selectedDb}
        clearable={false}
        placeholder={t("features.puzzle.selectDatabase")}
        onChange={onDatabaseChange}
      />
      <Divider my="sm" />
      <Group>
        <Input.Wrapper label={t("features.puzzle.ratingRange")} flex={1}>
          <RangeSlider
            min={minRating}
            max={maxRating}
            value={ratingRange}
            onChange={onRatingRangeChange}
            disabled={progressive || !dbRatingRange || (dbRatingRange && dbRatingRange[0] === dbRatingRange[1])}
          />
          {!dbRatingRange && selectedDb && (
            <div style={{ fontSize: "0.75rem", color: "var(--mantine-color-dimmed)", marginTop: "4px" }}>
              {t("features.puzzle.loadingRatingRange")}
            </div>
          )}
        </Input.Wrapper>
        <Input.Wrapper label={t("features.puzzle.progressive")}>
          <Center>
            <Checkbox
              checked={isProgressiveChecked}
              onChange={(event) => onProgressiveChange(event.currentTarget.checked)}
              disabled={isProgressiveDisabled}
            />
          </Center>
        </Input.Wrapper>
        <Input.Wrapper label={t("features.puzzle.hideRating")}>
          <Center>
            <Checkbox checked={hideRating} onChange={(event) => onHideRatingChange(event.currentTarget.checked)} />
          </Center>
        </Input.Wrapper>
        <Input.Wrapper label={t("features.puzzle.inOrder")}>
          <Center>
            <Checkbox checked={inOrder} onChange={(event) => onInOrderChange(event.currentTarget.checked)} />
          </Center>
        </Input.Wrapper>
      </Group>
    </>
  );
};
