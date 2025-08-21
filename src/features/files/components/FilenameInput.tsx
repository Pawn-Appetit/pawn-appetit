import { TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";

type FilenameInputProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  labelKey?: string; // defaults to "Common.Name"
  placeholderKey?: string; // defaults to "Common.EnterFileName"
};

export function FilenameInput({
  value,
  onChange,
  error,
  labelKey = "Common.Name",
  placeholderKey = "Common.EnterFileName",
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
