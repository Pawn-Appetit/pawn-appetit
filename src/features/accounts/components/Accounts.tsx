import {
  ActionIcon,
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  Group,
  InputWrapper,
  Modal,
  Stack,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { IconArrowsSort, IconDatabase, IconInfoCircle, IconPlus, IconSearch } from "@tabler/icons-react";
import { listen } from "@tauri-apps/api/event";
import { t } from "i18next";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DatabaseInfo } from "@/bindings";
import { commands } from "@/bindings";
import AccountCards from "@/components/AccountCards";
import GenericCard from "@/components/GenericCard";
import { sessionsAtom } from "@/state/atoms";
import { getChessComAccount } from "@/utils/chess.com/api";
import { getDatabases } from "@/utils/db";
import { getLichessAccount } from "@/utils/lichess/api";
import type { ChessComSession, LichessSession } from "@/utils/session";
import AccountsTableView from "./AccountsTableView";
import LichessLogo from "./LichessLogo";
import type { ViewType } from "./ViewToggle";
import ViewToggle from "./ViewToggle";

interface AccountsProps {
  handleOpen: () => void;
}

function Accounts({ handleOpen }: AccountsProps) {
  const [, setSessions] = useAtom(sessionsAtom);
  const isListening = useRef(false);
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  useEffect(() => {
    getDatabases().then((dbs) => setDatabases(dbs));
  }, []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "elo">("name");
  const [view, setView] = useLocalStorage<ViewType>({
    key: "accounts-view",
    defaultValue: "grid",
  });

  const addChessComSession = useCallback(
    (alias: string, session: ChessComSession) => {
      setSessions((sessions) => {
        const newSessions = sessions.filter((s) => s.chessCom?.username !== session.username);
        return [
          ...newSessions,
          {
            chessCom: session,
            player: alias,
            updatedAt: Date.now(),
          },
        ];
      });
    },
    [setSessions],
  );

  const addLichessSession = useCallback(
    (alias: string, session: LichessSession) => {
      setSessions((sessions) => {
        const newSessions = sessions.filter((s) => s.lichess?.username !== session.username);
        return [
          ...newSessions,
          {
            lichess: session,
            player: alias,
            updatedAt: Date.now(),
          },
        ];
      });
    },
    [setSessions],
  );

  async function addChessCom(player: string, username: string) {
    const p = player !== "" ? player : username;
    const stats = await getChessComAccount(username);
    if (!stats) {
      return;
    }
    addChessComSession(p, { username, stats });
  }

  async function addLichessNoLogin(player: string, username: string) {
    const p = player !== "" ? player : username;
    const account = await getLichessAccount({ username });
    if (!account) return;
    addLichessSession(p, { username, account });
  }

  const onLichessAuthentication = useCallback(
    async (token: string) => {
      const player = sessionStorage.getItem("lichess_player_alias") || "";
      sessionStorage.removeItem("lichess_player_alias");
      const account = await getLichessAccount({ token });
      if (!account) return;
      const username = account.username;
      const p = player !== "" ? player : username;
      addLichessSession(p, { accessToken: token, username: username, account });
    },
    [addLichessSession],
  );

  async function addLichess(player: string, username: string, withLogin: boolean) {
    if (withLogin) {
      sessionStorage.setItem("lichess_player_alias", player);
      return await commands.authenticate(username);
    }
    return await addLichessNoLogin(player, username);
  }

  useEffect(() => {
    async function listen_for_code() {
      if (isListening.current) return;
      isListening.current = true;
      await listen<string>("access_token", async (event) => {
        const token = event.payload;
        await onLichessAuthentication(token);
      });
    }

    listen_for_code();
  }, [onLichessAuthentication]);

  return (
    <>
      <Group wrap="wrap" gap="xs" justify="space-between">
        <Group>
          <TextInput
            aria-label="Search accounts"
            placeholder="Search accounts..."
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
          <ViewToggle value={view} onChange={setView} />
          <Tooltip label={t("accounts.viewDatabases", "View Player Databases")}>
            <ActionIcon size="lg" variant="default" onClick={handleOpen}>
              <IconDatabase size="1.2rem" />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Button size="xs" leftSection={<IconPlus size="1rem" />} onClick={() => setOpen(true)} mr="sm">
          Add Account
        </Button>
      </Group>
      {view === "grid" ? (
        <AccountCards databases={databases} setDatabases={setDatabases} query={query} sortBy={sortBy} />
      ) : (
        <AccountsTableView databases={databases} setDatabases={setDatabases} query={query} sortBy={sortBy} />
      )}
      <AccountModal open={open} setOpen={setOpen} addLichess={addLichess} addChessCom={addChessCom} />
    </>
  );
}

export default Accounts;

function AccountModal({
  open,
  setOpen,
  addLichess,
  addChessCom,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  addLichess: (player: string, username: string, withLogin: boolean) => void;
  addChessCom: (player: string, username: string) => void;
}) {
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
                particular, bot games are excluded from the downloadable archives and won’t be reflected in the total
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
