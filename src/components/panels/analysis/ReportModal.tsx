import { Button, Checkbox, Group, Modal, NumberInput, Select, Stack } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { memo, useContext, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { commands, type GoMode } from "@/bindings";
import { TreeStateContext } from "@/components/TreeStateContext";
import { enginesAtom, referenceDbAtom } from "@/state/atoms";
import type { LocalEngine } from "@/utils/engines";
import { unwrap } from "@/utils/unwrap";

const reportSettingsAtom = atomWithStorage("report-settings", {
  novelty: true,
  reversed: true,
  goMode: { t: "Time", c: 500 } as Exclude<GoMode, { t: "Infinite" }>,
  engine: "",
});

function ReportModal({
  tab,
  initialFen,
  moves,
  is960,
  reportingMode,
  toggleReportingMode,
  setInProgress,
  inProgress,
}: {
  tab: string;
  initialFen: string;
  moves: string[];
  is960: boolean;
  reportingMode: boolean;
  toggleReportingMode: () => void;
  setInProgress: (progress: boolean) => void;
  inProgress: boolean;
}) {
  const { t } = useTranslation();

  const referenceDb = useAtomValue(referenceDbAtom);
  const engines = useAtomValue(enginesAtom);
  const localEngines = engines.filter((e): e is LocalEngine => e.type === "local");
  const store = useContext(TreeStateContext)!;
  const addAnalysis = useStore(store, (s) => s.addAnalysis);

  const [reportSettings, setReportSettings] = useAtom(reportSettingsAtom);
  const analysisEngineRef = useRef<{ engine: string; tab: string } | null>(null);

  const form = useForm({
    initialValues: reportSettings,
    validate: {
      engine: (value) => {
        if (!value) return t("features.board.analysis.engineRequired");
      },
      novelty: (value) => {
        if (value && !referenceDb) return t("features.board.analysis.refDBRequired");
      },
    },
  });

  useEffect(() => {
    const engine =
      localEngines.length === 0
        ? ""
        : !reportSettings.engine || !localEngines.some((l) => l.path === reportSettings.engine)
          ? localEngines[0].path
          : reportSettings.engine;

    form.setValues({ ...reportSettings, engine });
  }, [localEngines.length, reportSettings]);

  const handleStop = async () => {
    if (analysisEngineRef.current) {
      try {
        await commands.stopEngine(analysisEngineRef.current.engine, analysisEngineRef.current.tab);
      } catch (error) {
        console.error("Error stopping engine:", error);
      }
      analysisEngineRef.current = null;
      setInProgress(false);
    }
  };

  function analyze() {
    setReportSettings(form.values);
    setInProgress(true);
    toggleReportingMode();
    const engine = localEngines.find((e) => e.path === form.values.engine);
    const engineSettings = (engine?.settings ?? []).map((s) => ({
      ...s,
      value: s.value?.toString() ?? "",
    }));

    if (is960 && !engineSettings.find((o) => o.name === "UCI_Chess960")) {
      engineSettings.push({ name: "UCI_Chess960", value: "true" });
    }

    const analysisId = `report_${tab}`;
    analysisEngineRef.current = { engine: form.values.engine, tab: analysisId };

    commands
      .analyzeGame(
        analysisId,
        form.values.engine,
        form.values.goMode,
        {
          annotateNovelties: form.values.novelty,
          fen: initialFen,
          referenceDb,
          reversed: form.values.reversed,
          moves,
        },
        engineSettings,
      )
      .then((analysis) => {
        if (analysisEngineRef.current) {
          const analysisData = unwrap(analysis);
          addAnalysis(analysisData);
        }
      })
      .catch((error) => {
        console.error("Analysis error:", error);
      })
      .finally(() => {
        analysisEngineRef.current = null;
        setInProgress(false);
      });
  }

  return (
    <Modal
      opened={reportingMode}
      onClose={() => toggleReportingMode()}
      title={t("features.board.analysis.generateReport")}
    >
      <form onSubmit={form.onSubmit(() => analyze())}>
        <Stack>
          <Select
            allowDeselect={false}
            withAsterisk
            label={t("common.engine")}
            placeholder="Pick one"
            data={
              localEngines.map((engine) => {
                return {
                  value: engine.path,
                  label: engine.name,
                };
              }) ?? []
            }
            {...form.getInputProps("engine")}
          />
          <Group wrap="nowrap">
            <Select
              allowDeselect={false}
              comboboxProps={{
                position: "bottom",
                middlewares: { flip: false, shift: false },
              }}
              data={[
                { label: t("chess.goMode.depth"), value: "Depth" },
                { label: t("features.board.analysis.time"), value: "Time" },
                { label: t("chess.goMode.nodes"), value: "Nodes" },
              ]}
              value={form.values.goMode.t}
              onChange={(v) => {
                const newGo = form.values.goMode;
                newGo.t = v as "Depth" | "Time" | "Nodes";
                form.setFieldValue("goMode", newGo);
              }}
            />
            <NumberInput
              min={1}
              value={form.values.goMode.c as number}
              onChange={(v) =>
                form.setFieldValue("goMode", {
                  ...(form.values.goMode as any),
                  c: (v || 1) as number,
                })
              }
            />
          </Group>

          <Checkbox
            label={t("features.board.analysis.reversed")}
            description={t("features.board.analysis.reversedDesc")}
            {...form.getInputProps("reversed", { type: "checkbox" })}
          />

          <Checkbox
            label={t("features.board.analysis.annotateNovelties")}
            description={t("features.board.analysis.annotateNoveltiesDesc")}
            {...form.getInputProps("novelty", { type: "checkbox" })}
          />

          <Group justify="right">
            {inProgress ? (
              <Button variant="filled" color="red" onClick={handleStop}>
                {t("keybindings.stopEngine")}
              </Button>
            ) : (
              <Button type="submit">{t("features.board.analysis.analyze")}</Button>
            )}
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export default memo(ReportModal);
