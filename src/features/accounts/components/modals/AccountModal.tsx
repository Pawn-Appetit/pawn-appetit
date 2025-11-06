import { Alert, Autocomplete, Button, Checkbox, Group, InputWrapper, Modal, Stack, TextInput } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useState } from "react";
import GenericCard from "@/components/GenericCard";
import { sessionsAtom } from "@/state/atoms";
import LichessLogo from "../LichessLogo";

interface AccountModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  addLichess: (player: string, username: string, withLogin: boolean) => void;
  addChessCom: (player: string, username: string) => void;
}

function AccountModal({ open, setOpen, addLichess, addChessCom }: AccountModalProps) {
  const sessions = useAtomValue(sessionsAtom);
  const [username, setUsername] = useState("");
  const [player, setPlayer] = useState<string>("");
  const [website, setWebsite] = useState<"lichess" | "chesscom">("lichess");
  const [withLogin, setWithLogin] = useState(false);

  const players = new Set(sessions.map((s) => s.player || s.lichess?.username || s.chessCom?.username || ""));

  function addAccount() {
    if (website === "lichess") {
      addLichess(player, username, withLogin);
    } else {
      addChessCom(player, username);
    }
    setOpen(false);
  }

  return (
    <Modal opened={open} onClose={() => setOpen(false)} title="Add Account">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addAccount();
        }}
      >
        <Stack>
          <Autocomplete
            label="Name"
            data={Array.from(players)}
            value={player}
            onChange={(value) => setPlayer(value)}
            placeholder="Select player"
          />
          <InputWrapper label="Website" required>
            <Group grow>
              <GenericCard
                id={"lichess"}
                isSelected={website === "lichess"}
                setSelected={() => setWebsite("lichess")}
                content={
                  <Group>
                    <LichessLogo />
                    Lichess
                  </Group>
                }
              />
              <GenericCard
                id={"chesscom"}
                isSelected={website === "chesscom"}
                setSelected={() => setWebsite("chesscom")}
                content={
                  <Group>
                    <img width={30} height={30} src="/chesscom.png" alt="chess.com" />
                    Chess.com
                  </Group>
                }
              />
            </Group>
            {website === "chesscom" && (
              <Alert mt="xs" color="yellow" icon={<IconInfoCircle size={16} />}>
                Due to limitations of the Chess.com Public API, the total games count may not include all game types. In
                particular, bot games are excluded from the downloadable archives and won't be reflected in the total
                count.
              </Alert>
            )}
          </InputWrapper>

          <TextInput
            label="Username"
            placeholder="Enter your username"
            required
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
          />
          {website === "lichess" && (
            <Checkbox
              label="Login with browser"
              description="Allows faster game downloads"
              checked={withLogin}
              onChange={(e) => setWithLogin(e.currentTarget.checked)}
            />
          )}
          <Button mt="1rem" type="submit">
            Add
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

export default AccountModal;
