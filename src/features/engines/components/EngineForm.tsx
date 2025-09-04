import { Button, Input, NumberInput, Text, TextInput } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { open } from "@tauri-apps/plugin-dialog";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { match } from "ts-pattern";
import { commands, type UciOptionConfig } from "@/bindings";
import FileInput from "@/common/components/FileInput";
import { type LocalEngine, requiredEngineSettings } from "@/utils/engines";
import { usePlatform } from "@/utils/files";

export default function EngineForm({
  onSubmit,
  form,
  submitLabel,
}: {
  onSubmit: (values: LocalEngine) => void;
  form: UseFormReturnType<LocalEngine, (values: LocalEngine) => LocalEngine>;
  submitLabel: string;
}) {
  const { t } = useTranslation();

  const { os } = usePlatform();
  const config = useRef<{ name: string; options: UciOptionConfig[] } | null>(null);
  const settings = config.current?.options
    .filter((o) => requiredEngineSettings.includes(o.value.name))
    .map((o) => ({
      name: o.value.name,
      // @ts-expect-error
      value: o.value.default,
    }));

  const filters = match(os)
    .with("windows", () => [{ name: "Executable Files", extensions: ["exe"] }])
    .otherwise(() => []);

  return (
    <form onSubmit={form.onSubmit(async (values) => onSubmit({ ...values, loaded: true, settings: settings || [] }))}>
      <FileInput
        label={t("features.engines.add.binaryFile")}
        description={t("features.engines.add.binaryFile.Desc")}
        filename={form.values.path}
        withAsterisk
        onClick={async () => {
          const selected = await open({
            multiple: false,
            filters,
          });
          if (!selected) return;
          const configResult = await commands.getEngineConfig(selected as string);
          config.current = configResult.status === "ok" ? configResult.data : { name: "", options: [] };
          form.setFieldValue("path", selected as string);
          form.setFieldValue("name", config.current.name || "Unknown Engine");
        }}
      />

      <TextInput
        label={t("features.engines.add.name")}
        placeholder={t("features.engines.add.name.Autodetect")}
        withAsterisk
        {...form.getInputProps("name")}
      />

      <NumberInput label="Elo" placeholder={t("features.engines.add.eloDesc")} {...form.getInputProps("elo")} />

      <Input.Wrapper
        label={t("features.engines.add.imageFile")}
        description={t("features.engines.add.imageFile.Desc")}
        {...form.getInputProps("image")}
      >
        <Input
          component="button"
          type="button"
          // accept="application/octet-stream"
          onClick={async () => {
            const selected = await open({
              multiple: false,
              filters: [
                {
                  name: "Image",
                  extensions: ["png", "jpeg"],
                },
              ],
            });
            form.setFieldValue("image", selected as string);
          }}
        >
          <Text lineClamp={1}>{form.values.image}</Text>
        </Input>
      </Input.Wrapper>

      <Button fullWidth mt="xl" type="submit">
        {submitLabel}
      </Button>
    </form>
  );
}
