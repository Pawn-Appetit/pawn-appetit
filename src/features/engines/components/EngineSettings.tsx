import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Checkbox,
  Divider,
  FileInput,
  Group,
  Loader,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconCloud, IconPhotoPlus } from "@tabler/icons-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type UciOptionConfig } from "@/bindings";
import GoModeInput from "@/components/GoModeInput";
import LocalImage from "@/components/LocalImage";
import { enginesAtom } from "@/state/atoms";
import { type LocalEngine, requiredEngineSettings } from "@/utils/engines";
import { JSONModal } from "./JSONModal";

interface EngineSettingsProps {
  selected: number;
  setSelected: (v: number | null) => void;
  isMobile: boolean;
}

type UciOptionWithCurrent =
  | {
      type: "spin";
      value: { name: string; default: bigint | null; min: bigint | null; max: bigint | null; value: number };
    }
  | { type: "combo"; value: { name: string; default: string | null; var: string[]; value: string } }
  | { type: "string"; value: { name: string; default: string | null; value: string | null } }
  | { type: "check"; value: { name: string; default: boolean | null; value: boolean } };

export function EngineSettings({ selected, setSelected, isMobile }: EngineSettingsProps) {
  const { t } = useTranslation();

  const [engines, setEngines] = useAtom(enginesAtom);
  const engine = engines[selected] as LocalEngine;
  const [options, setOptions] = useState<{ name: string; options: UciOptionConfig[] } | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const processedEngineRef = useRef<string | null>(null);
  const configCacheRef = useRef<Map<string, { name: string; options: UciOptionConfig[] }>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function fetchEngineConfig() {
      const cacheKey = `${engine.path}-${engine.name}`;

      if (configCacheRef.current.has(cacheKey)) {
        const cachedConfig = configCacheRef.current.get(cacheKey);
        if (cachedConfig) {
          setOptions(cachedConfig);
          setConfigError(null);
          return;
        }
      }

      setIsLoadingConfig(true);
      setConfigError(null);

      try {
        const fileExistsResult = await commands.fileExists(engine.path);
        if (cancelled) return;

        if (fileExistsResult.status !== "ok") {
          const fallbackConfig = {
            name: engine.name || t("features.engines.unknownEngine"),
            options: [],
          };
          setOptions(fallbackConfig);
          setConfigError(t("features.engines.settings.fileNotFound"));
          return;
        }

        const result = await commands.getEngineConfig(engine.path);
        if (cancelled) return;

        if (result.status === "ok") {
          configCacheRef.current.set(cacheKey, result.data);
          setOptions(result.data);
          setConfigError(null);
        } else {
          const fallbackConfig = {
            name: engine.name || t("features.engines.unknownEngine"),
            options: [],
          };
          setOptions(fallbackConfig);
          setConfigError(result.error);
        }
      } catch (error) {
        if (cancelled) return;
        const fallbackConfig = {
          name: engine.name || t("features.engines.unknownEngine"),
          options: [],
        };
        setOptions(fallbackConfig);
        setConfigError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setIsLoadingConfig(false);
        }
      }
    }

    setOptions(null);
    processedEngineRef.current = null;
    fetchEngineConfig();

    return () => {
      cancelled = true;
    };
  }, [engine.path, engine.name, t]);

  function setEngine(newEngine: LocalEngine) {
    setEngines(async (prev) => {
      const copy = [...(await prev)];
      copy[selected] = newEngine;
      return copy;
    });
  }

  useEffect(() => {
    if (!options) return;

    const engineKey = `${engine.path}-${JSON.stringify(engine.settings)}`;

    if (processedEngineRef.current === engineKey) return;

    const settings = [...(engine.settings || [])];
    const missing = requiredEngineSettings.filter((field) => !settings.find((setting) => setting.name === field));

    if (missing.length === 0) {
      processedEngineRef.current = engineKey;
      return;
    }

    for (const field of missing) {
      const opt = options.options.find((o) => o.value.name === field);
      if (opt) {
        // @ts-expect-error
        settings.push({ name: field, value: opt.value.default });
      }
    }

    processedEngineRef.current = engineKey;

    setEngines(async (prev) => {
      const copy = [...(await prev)];
      copy[selected] = { ...(copy[selected] as LocalEngine), settings };
      return copy;
    });
  }, [options, selected, engine.path, engine.settings, setEngines]);

  const completeOptions: UciOptionWithCurrent[] =
    options?.options
      .map((option: UciOptionConfig): UciOptionWithCurrent | null => {
        const setting = engine.settings?.find((s) => s.name === option.value.name);
        switch (option.type) {
          case "spin": {
            const cur =
              typeof setting?.value === "number" ? (setting.value as number) : Number(option.value.default ?? 0);
            return { type: "spin", value: { ...option.value, value: cur } };
          }
          case "combo": {
            const cur =
              typeof setting?.value === "string"
                ? (setting.value as string)
                : (option.value.default ?? option.value.var[0] ?? "");
            return { type: "combo", value: { ...option.value, value: cur } };
          }
          case "string": {
            const cur = typeof setting?.value === "string" ? (setting.value as string) : (option.value.default ?? null);
            return { type: "string", value: { ...option.value, value: cur } };
          }
          case "check": {
            const opt = option as Extract<UciOptionConfig, { type: "check" }>;
            const cur =
              typeof setting?.value === "boolean" ? (setting.value as boolean) : Boolean(opt.value.default ?? false);
            return { type: "check", value: { ...opt.value, value: cur } };
          }
          case "button":
            return null;
          default:
            return null;
        }
      })
      .filter((x): x is UciOptionWithCurrent => x !== null) || [];

  function changeImage() {
    open({
      title: t("features.engines.selectImage"),
    }).then((res) => {
      if (typeof res === "string") {
        setEngine({ ...engine, image: res });
      }
    });
  }

  const setSetting = useCallback(
    (name: string, value: string | number | boolean | null, def: string | number | boolean | null) => {
      setEngines(async (prev) => {
        const engines = await prev;
        const currentEngine = engines[selected] as LocalEngine;
        const currentSettings = currentEngine.settings || [];
        const existingSettingIndex = currentSettings.findIndex((s) => s.name === name);

        let newSettings: typeof currentSettings;

        if (existingSettingIndex >= 0) {
          newSettings = [...currentSettings];
          newSettings[existingSettingIndex] = { name, value };
        } else {
          newSettings = [...currentSettings, { name, value }];
        }

        if (value === def && !requiredEngineSettings.includes(name)) {
          newSettings = newSettings.filter((setting) => setting.name !== name);
        }

        const updatedEngines = [...engines];
        updatedEngines[selected] = {
          ...currentEngine,
          settings: newSettings,
        };

        return updatedEngines;
      });
    },
    [selected, setEngines],
  );

  const [jsonModal, toggleJSONModal] = useToggle();

  return (
    <ScrollArea h="100%" offsetScrollbars>
      <Stack>
        {isLoadingConfig && (
          <Center p="md">
            <Group>
              <Loader size="sm" />
              <Text size="sm">{t("common.loading")}...</Text>
            </Group>
          </Center>
        )}
        {configError && (
          <Alert icon={<IconCloud />} title={t("common.error")} color="yellow" variant="light">
            {configError}
          </Alert>
        )}
        <Divider variant="dashed" label={t("common.generalSettings")} />
        {isMobile ? (
          <Stack>
            <Group wrap="nowrap" w="100%">
              <TextInput
                flex={1}
                label={t("common.name")}
                value={engine.name}
                onChange={(e) => setEngine({ ...engine, name: e.currentTarget.value })}
              />
              <TextInput
                label={t("common.version")}
                w="5rem"
                value={engine.version}
                placeholder="?"
                onChange={(e) => setEngine({ ...engine, version: e.currentTarget.value })}
              />
            </Group>
            <Group grow>
              <NumberInput
                label="ELO"
                value={engine.elo || undefined}
                min={0}
                placeholder={t("common.unknown")}
                onChange={(v) =>
                  setEngine({
                    ...engine,
                    elo: typeof v === "number" ? v : undefined,
                  })
                }
              />
            </Group>
            <Switch
              label={t("common.enabled")}
              checked={!!engine.loaded}
              onChange={(e) => setEngine({ ...engine, loaded: e.currentTarget.checked })}
            />
            <Center>
              {engine.image ? (
                <Paper withBorder style={{ cursor: "pointer" }} onClick={changeImage}>
                  <LocalImage src={engine.image} alt={engine.name} mah="8rem" maw="100%" fit="contain" />
                </Paper>
              ) : (
                <ActionIcon
                  size="8rem"
                  variant="subtle"
                  styles={{
                    root: {
                      border: "1px dashed",
                    },
                  }}
                  onClick={changeImage}
                >
                  <IconPhotoPlus size="2rem" />
                </ActionIcon>
              )}
            </Center>
          </Stack>
        ) : (
          <Group grow align="start" wrap="nowrap">
            <Stack>
              <Group wrap="nowrap" w="100%">
                <TextInput
                  flex={1}
                  label={t("common.name")}
                  value={engine.name}
                  onChange={(e) => setEngine({ ...engine, name: e.currentTarget.value })}
                />
                <TextInput
                  label={t("common.version")}
                  w="5rem"
                  value={engine.version}
                  placeholder="?"
                  onChange={(e) => setEngine({ ...engine, version: e.currentTarget.value })}
                />
              </Group>
              <Group grow>
                <NumberInput
                  label="ELO"
                  value={engine.elo || undefined}
                  min={0}
                  placeholder={t("common.unknown")}
                  onChange={(v) =>
                    setEngine({
                      ...engine,
                      elo: typeof v === "number" ? v : undefined,
                    })
                  }
                />
              </Group>
              <Switch
                label={t("common.enabled")}
                checked={!!engine.loaded}
                onChange={(e) => setEngine({ ...engine, loaded: e.currentTarget.checked })}
              />
            </Stack>
            <Center>
              {engine.image ? (
                <Paper withBorder style={{ cursor: "pointer" }} onClick={changeImage}>
                  <LocalImage src={engine.image} alt={engine.name} mah="10rem" maw="100%" fit="contain" />
                </Paper>
              ) : (
                <ActionIcon
                  size="10rem"
                  variant="subtle"
                  styles={{
                    root: {
                      border: "1px dashed",
                    },
                  }}
                  onClick={changeImage}
                >
                  <IconPhotoPlus size="2.5rem" />
                </ActionIcon>
              )}
            </Center>
          </Group>
        )}
        <Divider variant="dashed" label={t("features.engines.settings.searchSettings")} />
        <GoModeInput goMode={engine.go || null} setGoMode={(v) => setEngine({ ...engine, go: v })} />

        <Divider variant="dashed" label={t("features.engines.settings.advancedSettings")} />
        <SimpleGrid cols={isMobile ? 1 : 2}>
          {completeOptions
            .filter((option) => option.type !== "check")
            .map((option) => {
              switch (option.type) {
                case "spin": {
                  const v = option.value;
                  return (
                    <NumberInput
                      key={v.name}
                      label={v.name}
                      min={Number(v.min ?? 0)}
                      max={Number(v.max ?? 0)}
                      value={Number(v.value)}
                      onChange={(e) => setSetting(v.name, e as number, Number(v.default ?? 0))}
                    />
                  );
                }
                case "combo": {
                  const v = option.value;
                  return (
                    <Select
                      key={v.name}
                      label={v.name}
                      data={v.var}
                      value={v.value}
                      onChange={(e) => setSetting(v.name, e, v.default)}
                    />
                  );
                }
                case "string": {
                  const v = option.value;
                  if (v.name.toLowerCase().includes("file")) {
                    const file = v.value ? new File([v.value], v.value) : null;
                    return (
                      <FileInput
                        key={v.name}
                        clearable
                        label={v.name}
                        value={file}
                        onClick={async () => {
                          const selected = await open({ multiple: false });
                          if (!selected) return;
                          setSetting(v.name, selected as string, v.default);
                        }}
                        onChange={(e) => {
                          if (e === null) {
                            setSetting(v.name, null, v.default);
                          }
                        }}
                      />
                    );
                  }
                  return (
                    <TextInput
                      key={v.name}
                      label={v.name}
                      value={v.value || ""}
                      onChange={(e) => setSetting(v.name, e.currentTarget.value, v.default)}
                    />
                  );
                }
                default:
                  return null;
              }
            })}
        </SimpleGrid>
        <SimpleGrid cols={isMobile ? 1 : 2}>
          {completeOptions
            .filter((option) => option.type === "check")
            .map((o) => (
              <Checkbox
                key={o.value.name}
                label={o.value.name}
                checked={!!o.value.value}
                onChange={(e) => setSetting(o.value.name, e.currentTarget.checked, o.value.default)}
              />
            ))}
        </SimpleGrid>

        <Group justify="end">
          <Button variant="default" onClick={() => toggleJSONModal(true)}>
            {t("features.engines.settings.editJSON")}
          </Button>
          <Button
            variant="default"
            onClick={() =>
              setEngine({
                ...engine,
                settings: options?.options
                  .filter((option) => requiredEngineSettings.includes(option.value.name))
                  .map((option) => ({
                    name: option.value.name,
                    // @ts-expect-error
                    value: option.value.default,
                  })),
              })
            }
          >
            {t("features.engines.settings.reset")}
          </Button>
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
                  setEngines(async (prev) => (await prev).filter((e) => e.name !== engine.name));
                  setSelected(null);
                },
              });
            }}
          >
            {t("common.remove")}
          </Button>
        </Group>
      </Stack>
      <JSONModal
        key={engine.name}
        opened={jsonModal}
        toggleOpened={toggleJSONModal}
        engine={engine}
        setEngine={(v) =>
          setEngines(async (prev) => {
            const copy = [...(await prev)];
            copy[selected] = v;
            return copy;
          })
        }
      />
    </ScrollArea>
  );
}
