import { SimpleGrid, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import GenericCard from "@/components/GenericCard";
import type { FileType } from "@/features/files/components/file";
import { FILE_TYPES, type FileTypeItem } from "@/features/files/components/file";

type FileTypeSelectorProps = {
  items?: readonly FileTypeItem[];
  value: FileType;
  onChange: (value: FileType) => void;
  labelKey?: string;
};

export function FileTypeSelector({
  items = FILE_TYPES,
  value,
  onChange,
  labelKey = "features.files.fileType.fileType",
}: FileTypeSelectorProps) {
  const { t } = useTranslation();

  return (
    <>
      <Text fz="sm" fw="bold">
        {t(labelKey)}
      </Text>
      <SimpleGrid cols={3}>
        {items.map((item) => (
          <GenericCard
            key={item.value}
            id={item.value}
            isSelected={value === item.value}
            setSelected={onChange}
            content={<Text ta="center">{t(item.labelKey)}</Text>}
          />
        ))}
      </SimpleGrid>
    </>
  );
}
