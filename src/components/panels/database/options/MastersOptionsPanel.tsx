import { Group } from "@mantine/core";
import { YearPickerInput } from "@mantine/dates";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { masterOptionsAtom } from "@/state/atoms";
import { parseDate } from "@/utils/format";
import { MIN_DATE } from "@/utils/lichess/api";

const MasterOptionsPanel = () => {
  const { t } = useTranslation();
  const [options, setOptions] = useAtom(masterOptionsAtom);
  return (
    <Group grow>
      <YearPickerInput
        label={t("databaseOptions.since")}
        placeholder={t("databaseOptions.pickDate")}
        value={options.since}
        minDate={MIN_DATE}
        maxDate={new Date()}
        onChange={(value) => setOptions({ ...options, since: parseDate(value) })}
        clearable
      />
      <YearPickerInput
        label={t("databaseOptions.until")}
        placeholder={t("databaseOptions.pickDate")}
        value={options.until}
        minDate={MIN_DATE}
        maxDate={new Date()}
        onChange={(value) => setOptions({ ...options, until: parseDate(value) })}
        clearable
      />
    </Group>
  );
};

export default MasterOptionsPanel;
