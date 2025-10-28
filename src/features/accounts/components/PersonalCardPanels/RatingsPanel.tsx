import { Stack, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PlayerGameInfo } from "@/bindings";
import { getTimeControl } from "@/utils/timeControl";
import DateRangeTabs, { DateRange } from "./DateRangeTabs";
import { gradientStops, linearGradientProps, tooltipContentStyle, tooltipCursorStyle } from "./RatingsPanel.css";
import ResultsChart from "./ResultsChart";
import TimeControlSelector from "./TimeControlSelector";
import TimeRangeSlider from "./TimeRangeSlider";
import WebsiteAccountSelector from "./WebsiteAccountSelector";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function calculateEarliestDate(dateRange: DateRange, ratingDates: number[]): number {
  const lastDate = ratingDates[ratingDates.length - 1];
  switch (dateRange) {
    case DateRange.SevenDays:
      return lastDate - 7 * MILLISECONDS_PER_DAY;
    case DateRange.ThirtyDays:
      return lastDate - 30 * MILLISECONDS_PER_DAY;
    case DateRange.NinetyDays:
      return lastDate - 90 * MILLISECONDS_PER_DAY;
    case DateRange.OneYear:
      return lastDate - 365 * MILLISECONDS_PER_DAY;
    case DateRange.AllTime:
    default:
      return Math.min(...ratingDates);
  }
}

function RatingsPanel({ playerName, info }: { playerName: string; info: PlayerGameInfo }) {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<DateRange | null>(DateRange.NinetyDays);
  const [timeControl, setTimeControl] = useState<string | null>(null);
  const [website, setWebsite] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState({ start: 0, end: 0 });

  const dates = useMemo(() => {
    const timezoneOffset = new Date().getTimezoneOffset() * 60 * 1000; // milliseconds
    const localDate = new Date(Date.now() - timezoneOffset);
    const todayString = localDate.toISOString().slice(0, 10);
    const today = new Date(todayString).getTime();

    const gameDates =
      info.site_stats_data
        ?.filter((games) => games.site === website)
        .filter((games) => account === "All accounts" || games.player === account)
        .flatMap((games) => games.data)
        .filter((game) => getTimeControl(website!, game.time_control) === timeControl)
        .map((game) => new Date(game?.date?.replaceAll(".", "-")).getTime()) ?? [];

    return Array.from(new Set([today, ...gameDates])).sort((a, b) => a - b);
  }, [info.site_stats_data, website, account, timeControl]);

  useEffect(() => {
    if (dateRange) {
      const earliestDate = calculateEarliestDate(dateRange as DateRange, dates);
      const earliestIndex = dates.findIndex((date) => date >= earliestDate);
      setTimeRange({ start: earliestIndex, end: dates.length - 1 });
    } else {
      setTimeRange({ start: 0, end: dates.length > 0 ? dates.length - 1 : 0 });
    }
  }, [dateRange, dates]);

  const [summary, ratingData] = useMemo(() => {
    const filteredGames =
      info.site_stats_data
        ?.filter((games) => games.site === website)
        .filter((games) => account === "All accounts" || games.player === account)
        .flatMap((games) => games.data)
        .filter((game) => getTimeControl(website!, game.time_control) === timeControl)
        .filter((game) => {
          const gameDate = new Date(game?.date?.replaceAll(".", "-")).getTime();
          const startDate = dates[timeRange.start];
          const endDate = dates[timeRange.end];
          return gameDate >= (startDate ?? 0) && gameDate <= (endDate ?? 0);
        }) ?? [];

    const wonCount = filteredGames.filter((game) => game.result === "Won").length;
    const drawCount = filteredGames.filter((game) => game.result === "Drawn").length;
    const lostCount = filteredGames.filter((game) => game.result === "Lost").length;

    const ratingData = (() => {
      const map = new Map<number, { date: number; player_elo: number }>();
      for (const game of filteredGames) {
        const date = new Date(game?.date?.replaceAll(".", "-")).getTime();
        const existingEntry = map.get(date);
        if (!existingEntry || existingEntry.player_elo < game.player_elo) {
          map.set(date, { date, player_elo: game.player_elo });
        }
      }
      return Array.from(map.values()).sort((a, b) => a.date - b.date);
    })();

    return [
      {
        games: filteredGames.length,
        won: wonCount,
        draw: drawCount,
        lost: lostCount,
      },
      ratingData,
    ];
  }, [info.site_stats_data, website, account, timeControl, dates, timeRange]);

  const playerEloDomain = useMemo(() => {
    if (ratingData.length === 0) return null;

    return ratingData.reduce<[number, number]>(
      ([min, max], { player_elo }) => [
        Math.floor(Math.min(min, player_elo) / 50) * 50,
        Math.ceil(Math.max(max, player_elo) / 50) * 50,
      ],
      [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
    );
  }, [ratingData]);

  return (
    <Stack>
      <WebsiteAccountSelector
        playerName={playerName}
        onWebsiteChange={setWebsite}
        onAccountChange={setAccount}
        allowAll={false}
      />
      <TimeControlSelector onTimeControlChange={setTimeControl} website={website} allowAll={false} />
      <DateRangeTabs timeRange={dateRange} onTimeRangeChange={(value) => setDateRange(value as DateRange | null)} />
      <Text pt="md" fw="bold" fz="lg" ta="center">
        {summary.games === 1 && t("common.games.one", { count: summary.games || 0 })}
        {summary.games > 1 && t("common.games.other", { count: summary.games || 0 })}
      </Text>
      {dates.length > 1 && (
        <>
          {summary.games > 0 && <ResultsChart won={summary.won} draw={summary.draw} lost={summary.lost} size="2rem" />}
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={ratingData}>
              <defs>
                <linearGradient {...linearGradientProps}>
                  {gradientStops.map((stopProps, index) => (
                    <stop key={index} {...stopProps} />
                  ))}
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3" vertical={false} />
              <XAxis
                dataKey="date"
                domain={[dates[timeRange.start], dates[timeRange.end]]}
                tickFormatter={(date) => new Date(date).toLocaleDateString()}
                type="number"
              />
              {playerEloDomain == null && <YAxis />}
              {playerEloDomain != null && <YAxis domain={playerEloDomain} />}
              <Tooltip
                contentStyle={tooltipContentStyle}
                cursor={tooltipCursorStyle}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
              />
              <Area
                name="Rating"
                dataKey="player_elo"
                type="monotone"
                stroke="var(--mantine-color-blue-filled)"
                strokeWidth={2}
                strokeOpacity={1}
                fillOpacity={0.25}
                fill={`url(#${linearGradientProps.id})`}
              />
            </AreaChart>
          </ResponsiveContainer>
          <TimeRangeSlider
            ratingDates={dates}
            dateRange={timeRange}
            onDateRangeChange={(range) => {
              setDateRange(null);
              setTimeRange(range);
            }}
          />
        </>
      )}
    </Stack>
  );
}

export default RatingsPanel;
