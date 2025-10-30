import { rem, Slider } from "@mantine/core";
import { IconGripVertical } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";

export default function HashSlider(props: { value: number; setValue: (v: number) => void; color?: string }) {
  const { t } = useTranslation();
  const [tempValue, setTempValue] = useState(Math.log2(props.value));

  useEffect(() => {
    setTempValue(Math.log2(props.value));
  }, [props.value]);

  const { data: memorySize } = useQuery({
    queryKey: ["memory"],
    queryFn: async () => {
      return ((await commands.memorySize()) as unknown as number) / 2;
    },
    staleTime: Infinity,
  });

  return (
    <Slider
      min={0}
      max={Math.log2(memorySize || 16)}
      color={props.color}
      value={tempValue}
      onChange={setTempValue}
      onChangeEnd={(v) => props.setValue(2 ** v)}
      label={(v) => t("units.bytes", { bytes: 2 ** v * 1024 * 1024, decimals: 0 })}
      thumbChildren={<IconGripVertical style={{ width: rem(20), height: rem(20) }} stroke={1.5} />}
      styles={(theme) => ({
        mark: {
          display: "flex",
        },
        thumb: {
          width: rem(20),
          height: rem(20),
          backgroundColor: theme.white,
          color: theme.colors.gray[5],
          border: `1px solid ${theme.colors.gray[2]}`,
        },
      })}
    />
  );
}
