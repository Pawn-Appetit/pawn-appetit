import { Accordion, Alert, Paper, ScrollArea, Stack } from "@mantine/core";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import type { DatabaseInfo } from "@/bindings";
import { AccountCard } from "@/features/accounts/components/AccountCard";
import { sessionsAtom } from "@/state/atoms";
import { getChessComAccount, getStats } from "@/utils/chess.com/api";
import { getLichessAccount } from "@/utils/lichess/api";
import type { Session } from "@/utils/session";

function AccountCards({
  databases,
  setDatabases,
  query = "",
  sortBy = "name",
}: {
  databases: DatabaseInfo[];
  setDatabases: React.Dispatch<React.SetStateAction<DatabaseInfo[]>>;
  query?: string;
  sortBy?: "name" | "elo";
}) {
  const sessions = useAtomValue(sessionsAtom);
  const playerNames = Array.from(
    new Set(
      sessions
        .map((s) => s.player ?? s.lichess?.username ?? s.chessCom?.username)
        .filter((n): n is string => typeof n === "string" && n.length > 0),
    ),
  );

  const playerSessions = playerNames.map((name) => ({
    name,
    sessions: sessions.filter(
      (s) => s.player === name || s.lichess?.username === name || s.chessCom?.username === name,
    ),
  }));

  function bestRatingForSession(s: Session): number {
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
  }

  function bestRatingForPlayer(sessions: Session[]): number {
    const vals = sessions.map(bestRatingForSession).filter((v) => v >= 0);
    return vals.length ? Math.max(...vals) : -1;
  }

  const q = query.trim().toLowerCase();
  const filteredAndSorted = playerSessions
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
      if (sortBy === "name") return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      const ra = bestRatingForPlayer(a.sessions);
      const rb = bestRatingForPlayer(b.sessions);
      return rb - ra;
    });

  const [mainAccount, setMainAccount] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("mainAccount");
    setMainAccount(stored);
  }, []);

  useEffect(() => {
    if (mainAccount) {
      localStorage.setItem("mainAccount", mainAccount);
    }
  }, [mainAccount]);

  return (
    <ScrollArea offsetScrollbars>
      <Stack>
        {filteredAndSorted.length === 0 ? (
          <Alert title="No accounts found" color="gray" variant="light">
            Try adjusting your search or add a new account.
          </Alert>
        ) : (
          filteredAndSorted.map(({ name, sessions }) => (
            <PlayerSession
              key={name}
              name={name}
              sessions={sessions}
              databases={databases}
              setDatabases={setDatabases}
              isMain={mainAccount === name}
              setMain={() => setMainAccount(name)}
            />
          ))
        )}
      </Stack>
    </ScrollArea>
  );
}

function PlayerSession({
  name,
  sessions,
  databases,
  setDatabases,
  isMain,
  setMain,
}: {
  name: string;
  sessions: Session[];
  databases: DatabaseInfo[];
  setDatabases: React.Dispatch<React.SetStateAction<DatabaseInfo[]>>;
  isMain?: boolean;
  setMain?: () => void;
}) {
  const [, setSessions] = useAtom(sessionsAtom);

  return (
    <Paper withBorder>
      <Accordion multiple chevronSize={14} chevronPosition="left">
        {sessions.map((session, i) => (
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
            isMain={isMain}
            setMain={setMain}
          />
        ))}
      </Accordion>
    </Paper>
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
    const totalGames = account.count?.all ?? 0;

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
        }
      }
    }

    return (
      <AccountCard
        key={account.id}
        name={name}
        token={lichessSession.accessToken}
        type="lichess"
        database={databases.find((db) => db.filename === `${account.username}_lichess.db3`) ?? null}
        title={account.username}
        updatedAt={session.updatedAt}
        total={totalGames}
        setSessions={setSessions}
        logout={() => {
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

    const database = databases.find((db) => db.filename === `${session.chessCom?.username}_chesscom.db3`) ?? null;
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
        logout={() => {
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
