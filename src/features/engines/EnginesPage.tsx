import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Divider,
  FileInput,
  Group,
  JsonInput,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Space,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue, useToggle } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconArrowsSort, IconCloud, IconCpu, IconPhotoPlus, IconPlus, IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { open } from "@tauri-apps/plugin-dialog";
import { useAtom } from "jotai";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type UciOptionConfig } from "@/bindings";
import GenericCard from "@/components/GenericCard";
import * as classes from "@/components/GenericCard.css";
import GoModeInput from "@/components/GoModeInput";
import LocalImage from "@/components/LocalImage";
import OpenFolderButton from "@/components/OpenFolderButton";
import LinesSlider from "@/components/panels/analysis/LinesSlider";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { Route } from "@/routes/engines";
import { enginesAtom } from "@/state/atoms";
import { type Engine, engineSchema, type LocalEngine, requiredEngineSettings } from "@/utils/engines";
import AddEngine from "./components/AddEngine";

const createEngineSearchText = (engine: Engine): string => {
  const parts = [
    engine.name,
    engine.type === "local" ? engine.path : engine.url,
    engine.type === "local" ? (engine.version ?? "") : "",
  ];
  return parts.join(" ").toLowerCase();
};

const sortEnginesByName = (a: Engine, b: Engine): number => a.name.toLowerCase().localeCompare(b.name.toLowerCase());

const sortEnginesByElo = (a: Engine, b: Engine): number => {
  const eloA = a.type === "local" ? (a.elo ?? -1) : -1;
  const eloB = b.type === "local" ? (b.elo ?? -1) : -1;
  return eloB - eloA;
};

const useEngineFiltering = (engines: Engine[], query: string, sortBy: "name" | "elo") => {
  return useMemo<number[]>(() => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      const result = engines
        .map((_, i) => i)
        .sort((a, b) => {
          const ea = engines[a];
          const eb = engines[b];
          return sortBy === "name" ? sortEnginesByName(ea, eb) : sortEnginesByElo(ea, eb);
        });

      return result;
    }

    const queryLower = trimmedQuery.toLowerCase();

    const searchableEngines = engines.map((e, i) => ({
      index: i,
      searchText: createEngineSearchText(e),
    }));

    const filteredIndices = searchableEngines
      .filter(({ searchText }) => searchText.includes(queryLower))
      .map(({ index }) => index);

    const result = filteredIndices.sort((a, b) => {
      const ea = engines[a];
      const eb = engines[b];
      return sortBy === "name" ? sortEnginesByName(ea, eb) : sortEnginesByElo(ea, eb);
    });

    return result;
  }, [engines, query, sortBy]);
};

export default function EnginesPage() {
  const { t } = useTranslation();
  const { layout } = useResponsiveLayout();

  const [engines, setEngines] = useAtom(enginesAtom);
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(query, 300);
  const [sortBy, setSortBy] = useState<"name" | "elo">("name");

  const { selected } = Route.useSearch();
  const navigate = useNavigate();

  const isMobile = layout.engines.layoutType === "mobile";
  const gridCols = isMobile ? 1 : { base: 1, md: 2 };
  const setSelected = (v: number | null) => {
    // @ts-expect-error
    navigate({ search: { selected: v ?? undefined } });
  };

  const selectedEngine = selected !== undefined ? engines[selected] : null;

  const filteredIndices = useEngineFiltering(engines, debouncedQuery, sortBy);

  return (
    <Stack h="100%">
      <AddEngine opened={opened} setOpened={setOpened} />
      <Group align="center" pl="lg" py="sm">
        <Title>{t("features.engines.title")}</Title>
        <OpenFolderButton base="AppDir" folder="engines" />
      </Group>
      <Group grow flex={1} style={{ overflow: "hidden" }} align="start" px="md" pb="md">
        <Stack>
          <Group wrap="wrap" gap="xs" justify="space-between">
            <Group>
              <TextInput
                aria-label={t("features.engines.searchPlaceholder")}
                placeholder={t("features.engines.searchPlaceholder")}
                leftSection={<IconSearch size="1rem" />}
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                w={{ base: "100%", sm: 260 }}
              />
              <Button
                variant="default"
                leftSection={<IconArrowsSort size="1rem" />}
                onClick={() => setSortBy((s) => (s === "name" ? "elo" : "name"))}
                aria-label={`Sort by ${sortBy === "name" ? "elo" : "name"}`}
              >
                Sort: {sortBy === "name" ? "Name" : "ELO"}
              </Button>
            </Group>
            <Button size="xs" leftSection={<IconPlus size="1rem" />} onClick={() => setOpened(true)} mr="sm">
              {t("common.addNew")}
            </Button>
          </Group>
          <ScrollArea h="calc(100vh - 190px)" offsetScrollbars aria-live="polite">
            {filteredIndices.length === 0 ? (
              <Alert title={t("features.engines.noEnginesFound")} color="gray" variant="light">
                {t("features.engines.noEnginesFoundMessage")}
              </Alert>
            ) : (
              <SimpleGrid cols={gridCols} spacing={{ base: "md", md: "sm" }}>
                {filteredIndices.map((i: number) => {
                  const item = engines[i];
                  const stats =
                    item.type === "local"
                      ? [
                          {
                            label: "ELO",
                            value: item.elo ? item.elo.toString() : "??",
                          },
                        ]
                      : [{ label: "Type", value: "Cloud" }];
                  if (item.type === "local" && item.version) {
                    stats.push({
                      label: t("common.version"),
                      value: item.version,
                    });
                  }
                  return (
                    <GenericCard
                      id={i}
                      key={`${item.name}-${i}`}
                      isSelected={selected === i}
                      setSelected={setSelected}
                      error={undefined}
                      content={<EngineName engine={item} stats={stats} />}
                    />
                  );
                })}
              </SimpleGrid>
            )}
          </ScrollArea>
        </Stack>
        <Paper withBorder p="md" h="100%">
          {!selectedEngine || selected === undefined ? (
            <Stack align="center" justify="center" h="100%">
              <Text ta="center">{t("features.engines.settings.noEngine")}</Text>
              <Text c="dimmed" size="sm" ta="center">
                {t("features.engines.settings.selectEngineTip")}
              </Text>
            </Stack>
          ) : selectedEngine.type === "local" ? (
            <EngineSettings selected={selected} setSelected={setSelected} isMobile={isMobile} />
          ) : (
            <Stack>
              <Divider variant="dashed" label={t("common.generalSettings")} />

              <TextInput
                w="50%"
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
              <Stack w="50%">
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

              <Group justify="right">
                <Button
                  color="red"
                  onClick={() => {
                    setEngines(async (prev) => {
                      const copy = [...(await prev)];
                      copy.splice(selected, 1);
                      return copy;
                    });
                    setSelected(null);
                  }}
                >
                  {t("common.remove")}
                </Button>
              </Group>
            </Stack>
          )}
        </Paper>
      </Group>
    </Stack>
  );
}

function EngineSettings({
  selected,
  setSelected,
  isMobile,
}: {
  selected: number;
  setSelected: (v: number | null) => void;
  isMobile: boolean;
}) {
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
  type UciOptionWithCurrent =
    | {
        type: "spin";
        value: { name: string; default: bigint | null; min: bigint | null; max: bigint | null; value: number };
      }
    | { type: "combo"; value: { name: string; default: string | null; var: string[]; value: string } }
    | { type: "string"; value: { name: string; default: string | null; value: string | null } }
    | { type: "check"; value: { name: string; default: boolean | null; value: boolean } };

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

function JSONModal({
  opened,
  toggleOpened,
  engine,
  setEngine,
}: {
  opened: boolean;
  toggleOpened: () => void;
  engine: Engine;
  setEngine: (v: Engine) => void;
}) {
  const { t } = useTranslation();

  const [value, setValue] = useState(JSON.stringify(engine, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal opened={opened} onClose={toggleOpened} title={t("features.engines.settings.editJSON")} size="xl">
      <JsonInput
        autosize
        value={value}
        onChange={(e) => {
          setValue(e);
          setError(null);
        }}
        error={error}
      />
      <Space h="md" />
      <Button
        onClick={() => {
          const parseRes = engineSchema.safeParse(JSON.parse(value));
          if (parseRes.success) {
            setEngine(parseRes.data);
            setError(null);
            toggleOpened();
          } else {
            setError(t("features.engines.invalidConfiguration"));
          }
        }}
      >
        {t("common.save")}
      </Button>
    </Modal>
  );
}

const EngineName = memo(function EngineName({
  engine,
  stats,
}: {
  engine: Engine;
  stats?: { label: string; value: string }[];
}) {
  const { layout } = useResponsiveLayout();
  const isMobile = layout.engines.layoutType === "mobile";
  const { data: fileExists, isLoading } = useQuery({
    queryKey: ["file-exists", engine.type === "local" ? engine.path : null],
    queryFn: async () => {
      const path = engine.type === "local" ? engine.path : null;
      if (path === null) return false;
      if (engine.type !== "local") return true;
      const res = await commands.fileExists(path);
      return res.status === "ok";
    },
    enabled: engine.type === "local",
    staleTime: Infinity,
  });

  const hasError = engine.type === "local" && !isLoading && !fileExists;

  return (
    <Group>
      <Box flex="1">
        {engine.image ? (
          <LocalImage src={engine.image} alt={engine.name} h={isMobile ? "100px" : "135px"} />
        ) : engine.type !== "local" ? (
          <IconCloud size={isMobile ? "100px" : "135px"} />
        ) : (
          <IconCpu size={isMobile ? "100px" : "135px"} />
        )}
      </Box>

      <Stack flex="1" gap={0}>
        <Stack gap="xs">
          <Group align="center" gap="xs" wrap="wrap">
            <Text fw="bold" lineClamp={1} c={hasError ? "red" : undefined} size={isMobile ? "sm" : "md"}>
              {engine.name} {hasError ? "(file missing)" : ""}
            </Text>
            {engine.type === "local" && engine.version && (
              <Badge size="xs" variant="light" color="teal">
                v{engine.version}
              </Badge>
            )}
          </Group>
          <Group>
            {!!engine.loaded && (
              <Badge size="xs" variant="outline" color="green">
                Enabled
              </Badge>
            )}
            <Badge size="xs" variant="light" color={engine.type === "local" ? "blue" : "grape"}>
              {engine.type === "local" ? "Local" : "Cloud"}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed" style={{ wordWrap: "break-word" }} lineClamp={1}>
            {engine.type === "local" ? engine.path.split(/\/|\\/).slice(-1)[0] : engine.url}
          </Text>
        </Stack>

        <Group justify="space-between">
          {stats?.map((stat) => (
            <Stack key={stat.label} gap="0" align="center">
              <Text size="xs" c="dimmed" fw="bold" className={classes.label} mt={isMobile ? "0.5rem" : "1rem"}>
                {stat.label}
              </Text>
              <Text fw={700} size={isMobile ? "md" : "lg"} style={{ lineHeight: 1 }}>
                {stat.value}
              </Text>
            </Stack>
          ))}
        </Group>
      </Stack>
    </Group>
  );
});
