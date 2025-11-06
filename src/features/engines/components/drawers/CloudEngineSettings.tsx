import { Button, Divider, Group, Stack, Switch, Text, TextInput } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import LinesSlider from "@/components/panels/analysis/LinesSlider";
import { enginesAtom } from "@/state/atoms";
import type { Engine } from "@/utils/engines";

interface CloudEngineSettingsProps {
  selectedEngine: Engine;
  selected: number;
  setSelected: (v: number | null) => void;
}

export function CloudEngineSettings({ selectedEngine, selected, setSelected }: CloudEngineSettingsProps) {
  const { t } = useTranslation();
  const [, setEngines] = useAtom(enginesAtom);

  if (selectedEngine.type === "local") return null;

  return (
    <Stack>
      <TextInput
        label={t("common.name")}
        value={selectedEngine.name}
        onChange={(e) => {
          setEngines(async (prev) => {
            const engines = await prev;
            const updatedEngines = [...engines];
            updatedEngines[selected] = {
              ...updatedEngines[selected],
              name: e.currentTarget.value,
            };
            return updatedEngines;
          });
        }}
      />

      <Switch
        label={t("common.enabled")}
        checked={!!selectedEngine.loaded}
        onChange={(e) => {
          const checked = e.currentTarget.checked;
          setEngines(async (prev) => {
            const engines = await prev;
            const updatedEngines = [...engines];
            updatedEngines[selected] = {
              ...updatedEngines[selected],
              loaded: checked,
            };
            return updatedEngines;
          });
        }}
      />

      <Divider variant="dashed" label={t("features.engines.settings.advancedSettings")} />
      <Stack>
        <Text fw="bold">{t("features.engines.settings.numOfLines")}</Text>
        <LinesSlider
          value={Number(selectedEngine.settings?.find((setting) => setting.name === "MultiPV")?.value) || 1}
          setValue={(v) => {
            setEngines(async (prev) => {
              const copy = [...(await prev)];
              const setting = copy[selected].settings?.find((setting) => setting.name === "MultiPV");
              if (setting) {
                setting.value = v;
              } else {
                if (!copy[selected].settings) {
                  copy[selected].settings = [];
                }
                copy[selected].settings?.push({
                  name: "MultiPV",
                  value: v,
                });
              }
              return copy;
            });
          }}
        />
      </Stack>

      <Group justify="end" mt="md">
        <Button
          color="red"
          onClick={() => {
            modals.openConfirmModal({
              title: t("features.engines.remove.title"),
              withCloseButton: false,
              children: (
                <>
                  <Text>{t("features.engines.remove.message")}</Text>
                  <Text>{t("common.cannotUndo")}</Text>
                </>
              ),
              labels: { confirm: t("common.remove"), cancel: t("common.cancel") },
              confirmProps: { color: "red" },
              onConfirm: () => {
                setEngines(async (prev) => {
                  const copy = [...(await prev)];
                  copy.splice(selected, 1);
                  return copy;
                });
                setSelected(null);
              },
            });
          }}
        >
          {t("common.remove")}
        </Button>
      </Group>
    </Stack>
  );
}
