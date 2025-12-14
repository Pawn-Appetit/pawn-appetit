import { Alert, ScrollArea, SimpleGrid, Skeleton, Stack, Text } from "@mantine/core";
import { IconMoodEmpty } from "@tabler/icons-react";
import { appDataDir, resolve } from "@tauri-apps/api/path";
import { remove } from "@tauri-apps/plugin-fs";
import { useAtom } from "jotai";
import { useEffect, useState, useMemo, useCallback } from "react";
import type { DatabaseInfo } from "@/bindings";
import { commands } from "@/bindings";
import type { SortState } from "@/components/GenericHeader";
import { sessionsAtom } from "@/state/atoms";
import { getChessComAccount, getStats } from "@/utils/chess.com/api";
import { getLichessAccount } from "@/utils/lichess/api";
import type { Session } from "@/utils/session";
import { AccountCard } from "../AccountCard";
import { saveMainAccount, getAccountFideId } from "@/utils/mainAccount";

function AccountCards({
  databases,
  setDatabases,
  query = "",
  sortBy = { field: "name", direction: "asc" },
  isLoading = false,
}: {
  databases: DatabaseInfo[];
  setDatabases: React.Dispatch<React.SetStateAction<DatabaseInfo[]>>;
  query?: string;
  sortBy?: SortState;
  isLoading?: boolean;
}) {
  const [sessions, setSessions] = useAtom(sessionsAtom);
  
  // Memoize player names extraction to avoid recalculation on every render
  const playerNames = useMemo(() => Array.from(
    new Set(
      sessions
        .map((s) => s.player ?? s.lichess?.username ?? s.chessCom?.username)
        .filter((n): n is string => typeof n === "string" && n.length > 0),
    ),
  ), [sessions]);

  // Memoize player sessions grouping
  const playerSessions = useMemo(() => playerNames.map((name) => ({
    name,
    sessions: sessions.filter(
      (s) => s.player === name || s.lichess?.username === name || s.chessCom?.username === name,
    ),
  })), [playerNames, sessions]);

  // Memoize rating calculation functions to avoid recreation on every render
  const bestRatingForSession = useCallback((s: Session): number => {
    if (s.lichess?.account?.perfs) {
      const p = s.lichess.account.perfs;
      const ratings = [p.bullet?.rating, p.blitz?.rating, p.rapid?.rating, p.classical?.rating].filter(
        (x): x is number => typeof x === "number",
      );
      if (ratings.length) return Math.max(...ratings);
    }
    if (s.chessCom?.stats) {
      const arr = getStats(s.chessCom.stats);
      if (arr.length) return Math.max(...arr.map((a) => a.value));
    }
    return -1;
  }, []);

  const bestRatingForPlayer = useCallback((sessions: Session[]): number => {
    const vals = sessions.map(bestRatingForSession).filter((v) => v >= 0);
    return vals.length ? Math.max(...vals) : -1;
  }, [bestRatingForSession]);

  // Memoize filtered and sorted results to avoid expensive operations on every render
  const filteredAndSorted = useMemo(() => {
  const q = query.trim().toLowerCase();
    return playerSessions
    .filter(({ name, sessions }) => {
      if (!q) return true;
      const usernames = sessions
        .map((s) => s.lichess?.username || s.chessCom?.username || "")
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return name.toLowerCase().includes(q) || usernames.includes(q);
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy.field === "name") {
        comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      } else if (sortBy.field === "elo") {
        const ra = bestRatingForPlayer(a.sessions);
        const rb = bestRatingForPlayer(b.sessions);
        comparison = ra - rb;
      }
      return sortBy.direction === "asc" ? comparison : -comparison;
    });
  }, [playerSessions, query, sortBy, bestRatingForPlayer]);

  const [mainAccount, setMainAccount] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("mainAccount");
    setMainAccount(stored);
  }, []);

  useEffect(() => {
    if (mainAccount) {
      localStorage.setItem("mainAccount", mainAccount);
      // Load FIDE ID for this account if it exists
      getAccountFideId(mainAccount).then((fideId) => {
        // Also save to new JSON format with FIDE ID if it exists
        saveMainAccount({ name: mainAccount, fideId: fideId || undefined }).catch(console.error);
      }).catch(() => {
        // If no FIDE ID, just save the account name
        saveMainAccount({ name: mainAccount }).catch(console.error);
      });
    }
  }, [mainAccount]);

  if (isLoading) {
    return (
      <ScrollArea offsetScrollbars>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="md" verticalSpacing="md">
          <Skeleton h="12rem" />
          <Skeleton h="12rem" />
          <Skeleton h="12rem" />
          <Skeleton h="12rem" />
        </SimpleGrid>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea offsetScrollbars>
      {filteredAndSorted.length === 0 ? (
        <Stack align="center" justify="center" py="xl" gap="md">
          <IconMoodEmpty size={48} stroke={1.5} style={{ opacity: 0.5 }} />
          <Alert variant="light" color="gray" title="No accounts found" radius="md">
            <Text size="sm">Try adjusting your search or add a new account to get started.</Text>
          </Alert>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="md" verticalSpacing="md">
          {filteredAndSorted.map(({ name, sessions }) =>
            sessions.map((session, i) => (
              <LichessOrChessCom
                key={
                  session.lichess?.account.id ??
                  (session.chessCom ? `chesscom:${session.chessCom.username}` : `session:${i}`)
                }
                name={name}
                session={session}
                databases={databases}
                setDatabases={setDatabases}
                setSessions={setSessions}
                isMain={mainAccount === name}
                setMain={() => setMainAccount(name)}
              />
            )),
          )}
        </SimpleGrid>
      )}
    </ScrollArea>
  );
}

function LichessOrChessCom({
  name,
  session,
  databases,
  setDatabases,
  setSessions,
  isMain,
  setMain,
}: {
  name: string;
  session: Session;
  databases: DatabaseInfo[];
  setDatabases: React.Dispatch<React.SetStateAction<DatabaseInfo[]>>;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  isMain?: boolean;
  setMain?: () => void;
}) {
  if (session.lichess?.account) {
    const account = session.lichess.account;
    const lichessSession = session.lichess;
    let totalGames = account.count?.all ?? 0;

    // Try to find database with exact match first, then try case-insensitive match
    let database = databases.find((db) => db.filename === `${account.username}_lichess.db3`) ?? null;
    if (!database) {
      database =
        databases.find((db) => db.filename.toLowerCase() === `${account.username}_lichess.db3`.toLowerCase()) ?? null;
    }

    // Ensure totalGames is at least equal to downloadedGames
    // This handles cases where account.count.all is outdated, incorrect, or unavailable
    // If we have downloaded games, the total should be at least equal to downloadedGames
    if (database?.type === "success" && database.game_count > 0) {
      totalGames = Math.max(totalGames, database.game_count);
    }

    const stats = [];
    const speeds = ["bullet", "blitz", "rapid", "classical"] as const;

    if (account.perfs) {
      for (const speed of speeds) {
        const perf = account.perfs[speed];
        if (perf) {
          stats.push({
            value: perf.rating,
            label: speed,
            diff: perf.prog,
          });
        } else {
          stats.push({
            value: 0,
            label: speed,
            diff: 0,
          });
        }
      }
    }

    return (
      <AccountCard
        key={account.id}
        name={name}
        token={lichessSession.accessToken}
        type="lichess"
        database={database}
        title={account.username}
        updatedAt={session.updatedAt}
        total={totalGames}
        setSessions={setSessions}
        logout={async () => {
          // Delete database file and PGN file for this account
          const dbDir = await appDataDir();
          const dbPath = await resolve(dbDir, "db", `${account.username}_lichess.db3`);
          const pgnPath = await resolve(dbDir, "db", `${account.username}_lichess.pgn`);

          try {
            // Delete database file if it exists
            try {
              await commands.deleteDatabase(dbPath);
            } catch {
              // Database file might not exist, ignore
            }

            // Delete PGN file if it exists
            try {
              await remove(pgnPath);
            } catch {
              // PGN file might not exist, ignore
            }

            // Delete analyzed games for this account
            try {
              const { removeAnalyzedGamesForAccount } = await import("@/utils/analyzedGames");
              await removeAnalyzedGamesForAccount(account.username, "lichess");
            } catch (error) {
              console.error("Error deleting analyzed games:", error);
            }
          } catch (error) {
            console.error("Error deleting account files:", error);
          }

          // Remove session
          setSessions((sessions) => sessions.filter((s) => s.lichess?.account.id !== account.id));
        }}
        setDatabases={setDatabases}
        reload={async () => {
          const account = await getLichessAccount({
            token: lichessSession.accessToken,
            username: lichessSession.username,
          });
          if (!account) return;
          setSessions((sessions) =>
            sessions.map((s) =>
              s.lichess?.account.id === account.id
                ? {
                    ...s,
                    lichess: {
                      account: account,
                      username: lichessSession.username,
                      accessToken: lichessSession.accessToken,
                    },
                    updatedAt: Date.now(),
                  }
                : s,
            ),
          );
        }}
        stats={stats}
        isMain={isMain}
        setMain={setMain}
      />
    );
  }
  if (session.chessCom?.stats) {
    let totalGames = 0;
    for (const stat of Object.values(session.chessCom.stats)) {
      if (stat.record) {
        totalGames += stat.record.win + stat.record.loss + stat.record.draw;
      }
    }

    // Try to find database with exact match first, then try case-insensitive match
    let database = databases.find((db) => db.filename === `${session.chessCom?.username}_chesscom.db3`) ?? null;
    if (!database) {
      database =
        databases.find(
          (db) => db.filename.toLowerCase() === `${session.chessCom?.username}_chesscom.db3`.toLowerCase(),
        ) ?? null;
    }

    // Ensure totalGames is at least equal to downloadedGames
    // This handles cases where stats are outdated, incorrect, or unavailable
    // If we have downloaded games, the total should be at least equal to downloadedGames
    if (database && database.type === "success") {
      totalGames = Math.max(totalGames, database.game_count ?? 0);
    }
    return (
      <AccountCard
        key={session.chessCom.username}
        name={name}
        type="chesscom"
        title={session.chessCom.username}
        database={database}
        updatedAt={session.updatedAt}
        total={totalGames}
        stats={getStats(session.chessCom.stats)}
        setSessions={setSessions}
        logout={async () => {
          if (!session.chessCom) return;

          // Delete database file and PGN file for this account
          const dbDir = await appDataDir();
          const dbPath = await resolve(dbDir, "db", `${session.chessCom.username}_chesscom.db3`);
          const pgnPath = await resolve(dbDir, "db", `${session.chessCom.username}_chesscom.pgn`);

          try {
            // Delete database file if it exists
            try {
              await commands.deleteDatabase(dbPath);
            } catch {
              // Database file might not exist, ignore
            }

            // Delete PGN file if it exists
            try {
              await remove(pgnPath);
            } catch {
              // PGN file might not exist, ignore
            }

            // Delete analyzed games for this account
            try {
              const { removeAnalyzedGamesForAccount } = await import("@/utils/analyzedGames");
              await removeAnalyzedGamesForAccount(session.chessCom.username, "chesscom");
            } catch (error) {
              console.error("Error deleting analyzed games:", error);
            }
          } catch (error) {
            console.error("Error deleting account files:", error);
          }

          // Remove session
          setSessions((sessions) => sessions.filter((s) => s.chessCom?.username !== session.chessCom?.username));
        }}
        reload={async () => {
          if (!session.chessCom) return;
          const stats = await getChessComAccount(session.chessCom?.username);
          if (!stats) return;
          setSessions((sessions) =>
            sessions.map((s) =>
              session.chessCom && s.chessCom?.username === session.chessCom?.username
                ? {
                    ...s,
                    chessCom: {
                      username: session.chessCom?.username,
                      stats,
                    },
                    updatedAt: Date.now(),
                  }
                : s,
            ),
          );
        }}
        setDatabases={setDatabases}
        isMain={isMain}
        setMain={setMain}
      />
    );
  }
}

export default AccountCards;
