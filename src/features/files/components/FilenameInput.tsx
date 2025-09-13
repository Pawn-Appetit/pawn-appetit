import { TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";

type FilenameInputProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  labelKey?: string; // defaults to "common.name"
  placeholderKey?: string; // defaults to "common.enterFileName"
};

export function FilenameInput({
  value,
  onChange,
  error,
  labelKey = "common.name",
  placeholderKey = "common.enterFileName",
}: FilenameInputProps) {
  const { t } = useTranslation();

  return (
    <TextInput
      label={t(labelKey)}
      placeholder={t(placeholderKey)}
      required
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      error={error}
    />
  );
}
