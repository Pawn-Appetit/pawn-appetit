import { ActionIcon, Box, Group, Kbd } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import cx from "clsx";
import { useAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import useRecordHotkeys from "@/hooks/useRecordHotkeys";
import { keyMapAtom } from "@/state/keybindings";
import * as classes from "./KeybindInput.css";

function KeybindInput({
  action,
  keybind,
}: {
  action: string;
  keybind: {
    name: string;
    keys: string;
  };
}) {
  const [hovering, setHovering] = useState(false);

  const [keys, { start, stop, isRecording }] = useRecordHotkeys();

  return (
    <>
      {!isRecording ? (
        <Box onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)} onClick={() => start()}>
          <KbdDisplay keys={keybind.keys} hovering={hovering} />
        </Box>
      ) : (
        <ShortcutInput keys={keys} stop={stop} action={action} />
      )}
    </>
  );
}

function KbdDisplay({ keys, hovering }: { keys: string; hovering: boolean }) {
  const splitted = keys.split("+");
  return (
    <Group>
      {splitted.map((key, i) => (
        <Group key={key}>
          <Kbd className={cx({ [classes.kbd]: hovering })}>{key}</Kbd>
          {i !== splitted.length - 1 && "+"}
        </Group>
      ))}
    </Group>
  );
}

function ShortcutInput({ keys, action, stop }: { keys: Set<string>; action: string; stop: () => void }) {
  const { t } = useTranslation();
  const [, setKeymap] = useAtom(keyMapAtom);
  const stringed = Array.from(keys).join("+");

  return (
    <Group>
      {stringed === "" ? <Kbd>{t("settings.pressAnyKey")}</Kbd> : <KbdDisplay keys={stringed} hovering={false} />}
      <ActionIcon
        variant="outline"
        color="gray"
        onClick={() => {
          stop();
        }}
      >
        <IconX />
      </ActionIcon>
      <ActionIcon
        variant="outline"
        color="blue"
        disabled={stringed === ""}
        onClick={() => {
          stop();
          setKeymap((prev) => ({
            ...prev,
            [action]: {
              /// @ts-expect-error action is key of keymap
              name: prev[action].name,
              keys: stringed,
            },
          }));
        }}
      >
        <IconCheck />
      </ActionIcon>
    </Group>
  );
}

export default KeybindInput;
