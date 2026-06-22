/**
 * Compute the UTC timestamp (in milliseconds) of a game from its stored
 * `Date` ("YYYY.MM.DD") and `UTCTime` ("HH:MM:SS") fields.
 *
 * This value is used as the incremental-download cursor: only games newer than
 * it are fetched and imported when refreshing an account. A `null` cursor
 * disables that filter and re-imports the entire history, so this helper only
 * returns `null` when the date itself is absent/unparseable. A missing time
 * falls back to the start of the day rather than collapsing the whole result
 * to `null`.
 */
export function gameDateToTimestamp(date?: string | null, time?: string | null): number | null {
    if (!date) {
        return null;
    }
    const [year, month, day] = date.split(".").map(Number);
    if (!year || !month || !day) {
        return null;
    }
    const [hour, minute, second] = (time ?? "00:00:00").split(":").map(Number);
    return Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0);
}
