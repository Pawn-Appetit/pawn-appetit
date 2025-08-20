import { ActionIcon, Code, Divider, Group, Text, Tooltip } from "@mantine/core";
import { IconReload } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { currentTabAtom } from "@/state/atoms";
import { unwrap } from "@/utils/unwrap";

function FileInfo({ setGames }: { setGames: React.Dispatch<React.SetStateAction<Map<number, string>>> }) {
  const { t } = useTranslation();
  const [tab, setCurrentTab] = useAtom(currentTabAtom);

  if (tab?.source?.type === "file") {
    return (
      <>
        <Group justify="space-between" py="sm" px="md">
          <Text>
            {t("Common.Games", { count: tab.source.numGames || 0 })}
          </Text>
          <Group>
            <Tooltip label={tab.source.path}>
              <Code>{tab.source.path.split(/[\\/]/).pop()}</Code>
            </Tooltip>

            <Tooltip label="Reload file">
              <ActionIcon
                variant="outline"
                size="sm"
                onClick={() => {
                  if (tab.source?.type === "file") {
                    commands.countPgnGames(tab.source.path).then((v) => {
                      setCurrentTab((prev) => {
                        if (prev.source?.type === "file") {
                          prev.source.numGames = unwrap(v);
                        }
                        return { ...prev };
                      });
                      setGames(new Map());
                    });
                  }
                }}
              >
                <IconReload size="1rem" />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        <Divider />
      </>
    );
  }

  return null;
}

export default FileInfo;
