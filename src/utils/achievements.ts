import { useUserStatsStore } from "@/state/userStatsStore";
import { countGamesOnDate } from "./gameRecords";
import { getTodayPuzzleCount } from "./puzzleStreak";

export type Achievement = {
  id: string;
  label: string;
};

export async function getAchievements(): Promise<Achievement[]> {
  const { userStats } = useUserStatsStore.getState();
  const todayPuzzles = getTodayPuzzleCount();
  const gamesToday = await countGamesOnDate();
  const todayISO = new Date().toISOString().slice(0, 10);
  const practicesToday = (userStats.completionDates || []).some((d: string) => d.slice(0, 10) === todayISO);
  const totalPoints = userStats.totalPoints || 0;

  const list: Achievement[] = [];

  if (todayPuzzles >= 5) list.push({ id: "tactician", label: "Tactician" });
  if (practicesToday) list.push({ id: "student", label: "Student" });
  if (gamesToday >= 2) list.push({ id: "grinder", label: "Grinder" });
  if (totalPoints >= 100) list.push({ id: "point-collector", label: "Point Collector" });

  return list;
}
