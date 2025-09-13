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
  if (!ratingDates.length) return 0;
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
    default:
      return Math.min(...ratingDates);
  }
}

interface RatingsPanelProps {
  playerName: string;
  info: PlayerGameInfo;
}

function RatingsPanel({ playerName, info }: RatingsPanelProps) {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<DateRange | null>(DateRange.NinetyDays);
  const [timeControl, setTimeControl] = useState<string | null>(null);
  const [website, setWebsite] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState({ start: 0, end: 0 });

  const dates = useMemo(() => {
    const today = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    return Array.from(
      new Set([
        today,
        ...info.site_stats_data
          ?.filter((games) => games.site === website)
          .filter((games) => account === "All accounts" || games.player === account)
          .flatMap((games) => games.data)
          .filter((game) => getTimeControl(website!, game.time_control) === timeControl)
          .map((game) => new Date(game.date).getTime()),
      ]),
    ).sort((a, b) => a - b);
  }, [info.site_stats_data, website, account, timeControl]);

  useEffect(() => {
    const newTimeRange = dateRange
      ? {
          start: Math.max(
            0,
            dates.findIndex((date) => date >= calculateEarliestDate(dateRange, dates)),
          ),
          end: Math.max(0, dates.length - 1),
        }
      : {
          start: 0,
          end: Math.max(0, dates.length - 1),
        };

    setTimeRange(newTimeRange);
  }, [dateRange, dates]);

  const [summary, ratingData] = useMemo(() => {
    if (!website || !timeControl) return [{ games: 0, won: 0, draw: 0, lost: 0 }, []];

    const filteredGames =
      info.site_stats_data
        ?.filter((games) => games.site === website)
        .filter((games) => account === "All accounts" || games.player === account)
        .flatMap((games) => games.data)
        .filter((game) => getTimeControl(website, game.time_control) === timeControl)
        .filter((game) => {
          const gameDate = new Date(game.date).getTime();
          return gameDate >= (dates[timeRange.start] || 0) && gameDate <= (dates[timeRange.end] || 0);
        }) ?? [];

    const totalGamesCount = filteredGames.length;
    const wonCount = filteredGames.filter((game) => game.result === "Won").length;
    const drawCount = filteredGames.filter((game) => game.result === "Drawn").length;
    const lostCount = filteredGames.filter((game) => game.result === "Lost").length;

    interface RatingDataPoint {
      date: number;
      player_elo: number;
    }

    const ratingData = filteredGames
      .reduce<RatingDataPoint[]>((acc, game) => {
        const date = new Date(game.date).getTime();
        const existingPoint = acc.find((point) => point.date === date);

        if (!existingPoint) {
          acc.push({ date, player_elo: game.player_elo });
        } else if (existingPoint.player_elo < game.player_elo) {
          existingPoint.player_elo = game.player_elo;
        }

        return acc;
      }, [])
      .sort((a, b) => a.date - b.date);

    return [
      {
        games: totalGamesCount,
        won: wonCount,
        draw: drawCount,
        lost: lostCount,
      },
      ratingData,
    ];
  }, [info.site_stats_data, website, account, timeControl, timeRange]);

  const playerEloDomain = useMemo(() => {
    if (ratingData.length === 0) return null;

    const [minElo, maxElo] = ratingData.reduce<[number, number]>(
      ([min, max], { player_elo }) => [Math.min(min, player_elo), Math.max(max, player_elo)],
      [Infinity, -Infinity],
    );

    return [Math.floor(minElo / 50) * 50, Math.ceil(maxElo / 50) * 50];
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
      <DateRangeTabs
        timeRange={dateRange}
        onTimeRangeChange={(value: string | null) => {
          setDateRange(value as DateRange | null);
        }}
      />
      <Text pt="md" fw="bold" fz="lg" ta="center">
        {summary.games === 1 && t("common.games.one", { count: summary.games || 0 })}
        {summary.games > 1 && t("common.games.other", { count: summary.games || 0 })}
      </Text>
      {dates.length > 1 && summary.games > 0 && (
        <>
          <ResultsChart won={summary.won} draw={summary.draw} lost={summary.lost} size="2rem" />
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={ratingData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient {...linearGradientProps}>
                  {gradientStops.map((stopProps, index) => (
                    <stop key={index} {...stopProps} />
                  ))}
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3" vertical={false} stroke="var(--mantine-color-gray-3)" />
              <XAxis
                dataKey="date"
                domain={[dates[timeRange.start], dates[timeRange.end]]}
                tickFormatter={(date) => new Date(date).toLocaleDateString()}
                type="number"
                stroke="var(--mantine-color-gray-7)"
                tick={{ fill: "var(--mantine-color-gray-7)" }}
              />
              <YAxis
                domain={playerEloDomain ?? undefined}
                stroke="var(--mantine-color-gray-7)"
                tick={{ fill: "var(--mantine-color-gray-7)" }}
              />
              <Tooltip
                contentStyle={tooltipContentStyle}
                cursor={tooltipCursorStyle}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
                formatter={(value: number) => [value, "Rating"]}
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
