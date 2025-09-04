import { expect, test } from "vitest";
import {
  createBytesFormatter,
  createBytesLongFormatter,
  createDateFormatter,
  createDatetimeFormatter,
  createDurationFormatter,
  createDurationLongFormatter,
  createNodesFormatter,
  createNodesLongFormatter,
  createScoreFormatter,
  formatDateToPGN,
  parseDate,
} from "../format";

// Mock i18n object for testing
const mockI18n = {
  t: (key: string, _options?: { lng?: string }) => {
    const translations: Record<string, string> = {
      "units.bytes.Bytes": "Bytes",
      "units.bytes.BytesLong": "Bytes",
      "units.bytes.Kilobytes": "KB",
      "units.bytes.Megabytes": "MB",
      "units.bytes.Gigabytes": "GB",
      "units.bytes.Terabytes": "TB",
      "units.bytes.KilobytesLong": "Kilobytes",
      "units.bytes.MegabytesLong": "Megabytes",
      "units.bytes.GigabytesLong": "Gigabytes",
      "units.bytes.TerabytesLong": "Terabytes",
      "units.nodes.Thousand": "k",
      "units.nodes.Million": "M",
      "units.nodes.Billion": "B",
      "units.nodes.Trillion": "T",
      "units.nodes.Quadrillion": "Q",
      "units.nodes.Quintillion": "Qi",
      "units.nodes.Nodes": "nodes",
      "units.nodes.NodesPerSecond": "nodes/s",
      "units.duration.Seconds": "s",
      "units.duration.Minutes": "m",
      "units.duration.Hours": "h",
      "units.duration.Days": "d",
      "units.duration.SecondsLong": "seconds",
      "units.duration.MinutesLong": "minutes",
      "units.duration.HoursLong": "hours",
      "units.duration.DaysLong": "days",
      "units.score.Mate": "M",
      "units.score.DTZ": "DTZ",
      "units.score.Centipawns": "cp",
      "units.score.CentipawnsLong": "centipawns",
    };
    return translations[key] || key;
  },
  language: "en",
};

// Bytes Formatters
test("createBytesFormatter formats bytes correctly", () => {
  const bytesFormatter = createBytesFormatter(mockI18n);
  expect(bytesFormatter(1024)).toBe("1.00 KB");
  expect(bytesFormatter(1048576)).toBe("1.00 MB");
  expect(bytesFormatter(1073741824)).toBe("1.00 GB");
  expect(bytesFormatter(1099511627776)).toBe("1.00 TB");
  expect(bytesFormatter(512)).toBe("512.00 Bytes");
});

test("createBytesLongFormatter formats bytes with long labels", () => {
  const bytesLongFormatter = createBytesLongFormatter(mockI18n);
  expect(bytesLongFormatter(1024)).toBe("1.00 Kilobytes");
  expect(bytesLongFormatter(1048576)).toBe("1.00 Megabytes");
  expect(bytesLongFormatter(1073741824)).toBe("1.00 Gigabytes");
  expect(bytesLongFormatter(1099511627776)).toBe("1.00 Terabytes");
});

test("bytes formatters handle custom precision", () => {
  const bytesFormatter = createBytesFormatter(mockI18n);
  expect(bytesFormatter(1024, undefined, { decimals: 1 })).toBe("1.0 KB");
  expect(bytesFormatter(1536, undefined, { decimals: 1 })).toBe("1.5 KB");
});

// Nodes Formatters
test("createNodesFormatter formats nodes correctly", () => {
  const nodesFormatter = createNodesFormatter(mockI18n);
  expect(nodesFormatter(1000)).toBe("1k");
  expect(nodesFormatter(1000000)).toBe("1M");
  expect(nodesFormatter(1000000000)).toBe("1B");
  expect(nodesFormatter(1000000000000)).toBe("1T");
  expect(nodesFormatter(1000000000000000)).toBe("1Q");
  expect(nodesFormatter(1000000000000000000)).toBe("1Qi");
  expect(nodesFormatter(500)).toBe("500");
});

test("createNodesLongFormatter formats nodes with long labels", () => {
  const nodesLongFormatter = createNodesLongFormatter(mockI18n);
  expect(nodesLongFormatter(1000)).toBe("1,000 nodes");
  expect(nodesLongFormatter(1000000)).toBe("1,000,000 nodes");
  expect(nodesLongFormatter(1000000000)).toBe("1,000,000,000 nodes");
  expect(nodesLongFormatter(1000000000000)).toBe("1,000,000,000,000 nodes");
});

test("nodes formatters handle sub-1 values", () => {
  const nodesFormatter = createNodesFormatter(mockI18n);
  expect(nodesFormatter(0.5)).toBe("5.00e-1");
  expect(nodesFormatter(0.001)).toBe("1.00e-3");
});

test("nodes formatters handle custom precision", () => {
  const nodesFormatter = createNodesFormatter(mockI18n);
  expect(nodesFormatter(1500)).toBe("1.5k");
  expect(nodesFormatter(1000)).toBe("1k");
});

// Duration Formatters
test("createDurationFormatter formats duration correctly", () => {
  const durationFormatter = createDurationFormatter(mockI18n);
  expect(durationFormatter(1000)).toBe("1s");
  expect(durationFormatter(60000)).toBe("1m");
  expect(durationFormatter(3600000)).toBe("1h");
  expect(durationFormatter(65000)).toBe("1m 5s");
  expect(durationFormatter(3661000)).toBe("1h 1m 1s");
});

test("createDurationLongFormatter formats duration with long labels", () => {
  const durationLongFormatter = createDurationLongFormatter(mockI18n);
  expect(durationLongFormatter(1000)).toBe("1 seconds");
  expect(durationLongFormatter(60000)).toBe("1 minutes");
  expect(durationLongFormatter(3600000)).toBe("1 hours");
  expect(durationLongFormatter(65000)).toBe("1 minutes, 5 seconds");
  expect(durationLongFormatter(3661000)).toBe("1 hours, 1 minutes, 1 seconds");
});

test("duration formatters handle zero duration", () => {
  const durationFormatter = createDurationFormatter(mockI18n);
  const durationLongFormatter = createDurationLongFormatter(mockI18n);
  expect(durationFormatter(0)).toBe("0s");
  expect(durationLongFormatter(0)).toBe("0 seconds");
});

// Score Formatters
test("createScoreFormatter formats CP scores correctly", () => {
  const scoreFormatter = createScoreFormatter(mockI18n);
  expect(scoreFormatter({ type: "cp", value: 150 })).toBe("+1.50");
  expect(scoreFormatter({ type: "cp", value: -75 })).toBe("-0.75");
  expect(scoreFormatter({ type: "cp", value: 0 })).toBe("0.00");
});

test("createScoreFormatter formats mate scores correctly", () => {
  const scoreFormatter = createScoreFormatter(mockI18n);
  expect(scoreFormatter({ type: "mate", value: 5 })).toBe("+M5");
  expect(scoreFormatter({ type: "mate", value: -3 })).toBe("-M3");
});

test("createScoreFormatter formats DTZ scores correctly", () => {
  const scoreFormatter = createScoreFormatter(mockI18n);
  expect(scoreFormatter({ type: "dtz", value: 10 })).toBe("DTZ10");
  expect(scoreFormatter({ type: "dtz", value: -5 })).toBe("DTZ5");
});

test("score formatter handles custom precision", () => {
  const scoreFormatter = createScoreFormatter(mockI18n);
  expect(scoreFormatter({ type: "cp", value: 150 }, undefined, { precision: 1 })).toBe("+1.5");
  expect(scoreFormatter({ type: "cp", value: 150 }, undefined, { precision: 3 })).toBe("+1.500");
});

// Language Support
test("formatters respect language parameter", () => {
  const frenchI18n = {
    t: (key: string, _options?: { lng?: string }) => {
      const translations: Record<string, string> = {
        "units.bytes.Kilobytes": "Ko",
        "units.bytes.Megabytes": "Mo",
        "units.bytes.Gigabytes": "Go",
        "units.bytes.Terabytes": "To",
        "units.nodes.Thousand": "k",
        "units.nodes.Million": "M",
        "units.score.Mate": "M",
        "units.score.DTZ": "DTZ",
      };
      return translations[key] || key;
    },
    language: "fr",
  };

  const bytesFormatter = createBytesFormatter(frenchI18n);
  expect(bytesFormatter(1024, "fr")).toBe("1.00 Ko");
  expect(bytesFormatter(1048576, "fr")).toBe("1.00 Mo");
});

test("formatters fallback to i18n language", () => {
  const frenchI18n = {
    t: (key: string, _options?: { lng?: string }) => {
      const translations: Record<string, string> = {
        "units.bytes.Kilobytes": "Ko",
        "units.bytes.Megabytes": "Mo",
        "units.bytes.Gigabytes": "Go",
        "units.bytes.Terabytes": "To",
        "units.nodes.Thousand": "k",
        "units.nodes.Million": "M",
        "units.score.Mate": "M",
        "units.score.DTZ": "DTZ",
      };
      return translations[key] || key;
    },
    language: "fr",
  };

  const bytesFormatter = createBytesFormatter(frenchI18n);
  expect(bytesFormatter(1024)).toBe("1.00 Ko");
});

// Edge Cases
test("handles zero values", () => {
  const bytesFormatter = createBytesFormatter(mockI18n);
  const nodesFormatter = createNodesFormatter(mockI18n);
  const durationFormatter = createDurationFormatter(mockI18n);
  const scoreFormatter = createScoreFormatter(mockI18n);

  expect(bytesFormatter(0)).toBe("0 Bytes");
  expect(nodesFormatter(0)).toBe("0.00e+0");
  expect(durationFormatter(0)).toBe("0s");
  expect(scoreFormatter({ type: "cp", value: 0 })).toBe("0.00");
});

test("handles very large values", () => {
  const bytesFormatter = createBytesFormatter(mockI18n);
  const nodesFormatter = createNodesFormatter(mockI18n);

  expect(bytesFormatter(Number.MAX_SAFE_INTEGER)).toBe("8192.00 TB");
  expect(nodesFormatter(Number.MAX_SAFE_INTEGER)).toBe("9.0Q");
});

test("handles negative values appropriately", () => {
  const bytesFormatter = createBytesFormatter(mockI18n);
  const nodesFormatter = createNodesFormatter(mockI18n);
  const scoreFormatter = createScoreFormatter(mockI18n);

  expect(bytesFormatter(-1024)).toBe("1.00 KB"); // Absolute value
  expect(nodesFormatter(-1000)).toBe("1k"); // Absolute value
  expect(scoreFormatter({ type: "cp", value: -150 })).toBe("-1.50"); // Preserves sign
});

// Date Formatters
test("createDateFormatter formats dates correctly", () => {
  const testDate = new Date("2025-08-23T12:00:00Z");

  // Test default mode (no storage provided) - should default to intl
  const defaultDateFormatter = createDateFormatter(mockI18n);
  const defaultResult = defaultDateFormatter(testDate, "en", { timeZone: "UTC" });
  expect(typeof defaultResult).toBe("string");
  expect(defaultResult).toBe("2025-08-23"); // International format (default)

  // Test locale mode
  const mockLocaleStorage = {
    getItem: (key: string) => (key === "dateFormatMode" ? "locale" : null),
  };
  const localeDateFormatter = createDateFormatter(mockI18n, mockLocaleStorage as Storage);
  const localeResult = localeDateFormatter(testDate, "en", { timeZone: "UTC" });
  expect(typeof localeResult).toBe("string");
  expect(localeResult).toBe("8/23/25"); // Locale format

  // Test international mode
  const mockIntlStorage = {
    getItem: (key: string) => (key === "dateFormatMode" ? "intl" : null),
  };
  const intlDateFormatter = createDateFormatter(mockI18n, mockIntlStorage as Storage);
  const intlResult = intlDateFormatter(testDate, "en", { timeZone: "UTC" });
  expect(typeof intlResult).toBe("string");
  expect(intlResult).toBe("2025-08-23"); // International format
});

test("createDatetimeFormatter formats datetimes correctly", () => {
  const testDate = new Date("2025-08-23T13:55:00Z");

  // Test default mode (no storage provided) - should default to intl
  const defaultDatetimeFormatter = createDatetimeFormatter(mockI18n);
  const defaultResult = defaultDatetimeFormatter(testDate, "en", { timeZone: "UTC" });
  expect(typeof defaultResult).toBe("string");
  expect(defaultResult).toBe("2025-08-23, 13:55"); // International format (default)

  // Test locale mode
  const mockLocaleStorage = {
    getItem: (key: string) => (key === "dateFormatMode" ? "locale" : null),
  };
  const localeDatetimeFormatter = createDatetimeFormatter(mockI18n, mockLocaleStorage as Storage);
  const localeResult = localeDatetimeFormatter(testDate, "en", { timeZone: "UTC" });
  expect(typeof localeResult).toBe("string");
  expect(localeResult).toBe("08/23/2025, 13:55"); // Locale format

  // Test international mode
  const mockIntlStorage = {
    getItem: (key: string) => (key === "dateFormatMode" ? "intl" : null),
  };
  const intlDatetimeFormatter = createDatetimeFormatter(mockI18n, mockIntlStorage as Storage);
  const intlResult = intlDatetimeFormatter(testDate, "en", { timeZone: "UTC" });
  expect(typeof intlResult).toBe("string");
  expect(intlResult).toBe("2025-08-23, 13:55"); // International format
});

test("date formatters handle non-Date values", () => {
  const mockStorage = {
    getItem: (key: string) => (key === "dateFormatMode" ? "locale" : null),
  };
  const dateFormatter = createDateFormatter(mockI18n, mockStorage as Storage);
  const datetimeFormatter = createDatetimeFormatter(mockI18n, mockStorage as Storage);

  expect(dateFormatter("not a date", "en")).toBe("not a date");
  expect(datetimeFormatter(123, "en")).toBe("123");
  expect(dateFormatter(null, "en")).toBe("null");
});

// parseDate Function Tests
test("parseDate handles valid date strings", () => {
  expect(parseDate("2025-08-23")).toEqual(new Date("2025-08-23"));
  expect(parseDate("2025.08.23")).toEqual(new Date("2025.08.23"));
  expect(parseDate("2025/08/23")).toEqual(new Date("2025/08/23"));
});

test("parseDate handles Date objects", () => {
  const testDate = new Date("2025-08-23T12:00:00Z");
  expect(parseDate(testDate)).toEqual(testDate);

  // Test with invalid Date object
  const invalidDate = new Date("invalid");
  expect(parseDate(invalidDate)).toBeUndefined();
});

test("parseDate handles timestamp numbers", () => {
  const timestamp = 1745481600000; // 2025-04-24T12:00:00Z
  const expectedDate = new Date(timestamp);
  expect(parseDate(timestamp)).toEqual(expectedDate);

  // Test with negative timestamp
  const negativeTimestamp = -1745481600000;
  const expectedNegativeDate = new Date(negativeTimestamp);
  expect(parseDate(negativeTimestamp)).toEqual(expectedNegativeDate);
});

test("parseDate handles null and undefined", () => {
  expect(parseDate(null)).toBeUndefined();
  expect(parseDate(undefined)).toBeUndefined();
});

test("parseDate handles invalid inputs", () => {
  expect(parseDate("")).toBeUndefined();
  expect(parseDate("not a date")).toBeUndefined();
  expect(parseDate("2025-13-45")).toBeUndefined(); // Invalid month/day
  expect(parseDate("invalid-date-string")).toBeUndefined();
});

test("parseDate handles edge cases", () => {
  // Test with 0 timestamp - this should be valid
  expect(parseDate(0)).toEqual(new Date(0));

  // Test with very large timestamp - should be invalid
  const largeTimestamp = Number.MAX_SAFE_INTEGER;
  expect(parseDate(largeTimestamp)).toBeUndefined();

  // Test with very small timestamp - should be invalid
  const smallTimestamp = Number.MIN_SAFE_INTEGER;
  expect(parseDate(smallTimestamp)).toBeUndefined();
});

test("parseDate handles PGN date format specifically", () => {
  // PGN format: YYYY.MM.DD - these should work with explicit timezone
  expect(parseDate("2025.08.23")).toEqual(new Date("2025.08.23"));
  expect(parseDate("1999.12.31")).toEqual(new Date("1999.12.31"));
  expect(parseDate("2000.01.01")).toEqual(new Date("2000.01.01"));

  // Test with single digit month/day (should still work)
  expect(parseDate("2025.1.5")).toEqual(new Date("2025.01.05"));
});

// formatDateToPGN Function Tests
test("formatDateToPGN formats valid dates correctly", () => {
  const testDate = new Date("2025.08.23");
  expect(formatDateToPGN(testDate)).toBe("2025.08.23");

  const testDate2 = new Date("1999.12.31");
  expect(formatDateToPGN(testDate2)).toBe("1999.12.31");

  const testDate3 = new Date("2000.01.01");
  expect(formatDateToPGN(testDate3)).toBe("2000.01.01");
});

test("formatDateToPGN handles date strings", () => {
  expect(formatDateToPGN("2025.08.23")).toBe("2025.08.23");
  expect(formatDateToPGN("1999.12.31")).toBe("1999.12.31");
  expect(formatDateToPGN("2000.01.01")).toBe("2000.01.01");
});

test("formatDateToPGN handles timestamp numbers", () => {
  const timestamp = 1745481600000; // 2025-04-24T12:00:00Z
  expect(formatDateToPGN(timestamp)).toBe("2025.04.24");

  const timestamp2 = 946684800000; // 2000-01-01T00:00:00Z
  expect(formatDateToPGN(timestamp2)).toBe("2000.01.01");
});

test("formatDateToPGN handles null and undefined", () => {
  expect(formatDateToPGN(null)).toBeUndefined();
  expect(formatDateToPGN(undefined)).toBeUndefined();
});

test("formatDateToPGN handles invalid inputs", () => {
  expect(formatDateToPGN("")).toBeUndefined();
  expect(formatDateToPGN("not a date")).toBeUndefined();
  expect(formatDateToPGN("2025-13-45")).toBeUndefined(); // Invalid month/day
  expect(formatDateToPGN("invalid-date-string")).toBeUndefined();

  // Test with invalid Date object
  const invalidDate = new Date("invalid");
  expect(formatDateToPGN(invalidDate)).toBeUndefined();
});

test("formatDateToPGN handles different time zones correctly", () => {
  // Test that time zone doesn't affect the date part
  const utcDate = new Date("2025-08-23T12:00:00Z");
  const localDate = new Date("2025-08-23T12:00:00");

  expect(formatDateToPGN(utcDate)).toBe("2025.08.23");
  expect(formatDateToPGN(localDate)).toBe("2025.08.23");
});

test("formatDateToPGN handles leap years", () => {
  expect(formatDateToPGN("2024-02-29")).toBe("2024.02.29"); // Leap year
  expect(formatDateToPGN("2023-02-28")).toBe("2023.02.28"); // Non-leap year
});

test("formatDateToPGN handles month/day padding", () => {
  // Test that single digit months and days are properly padded
  expect(formatDateToPGN("2025-01-05")).toBe("2025.01.05");
  expect(formatDateToPGN("2025-12-31")).toBe("2025.12.31");
  expect(formatDateToPGN("2025-03-09")).toBe("2025.03.09");
});

test("formatDateToPGN round-trip consistency", () => {
  // Test that parseDate and formatDateToPGN work together consistently
  const originalDate = "2025.08.23";
  const parsedDate = parseDate(originalDate);
  const formattedDate = formatDateToPGN(parsedDate);

  expect(formattedDate).toBe(originalDate);

  // Test with different input formats
  const dateString = "2025-08-23T12:00:00Z";
  const parsed = parseDate(dateString);
  const formatted = formatDateToPGN(parsed);

  expect(formatted).toBe("2025.08.23");
});

test("formatDateToPGN handles historical dates", () => {
  expect(formatDateToPGN("1900-01-01")).toBe("1900.01.01");
  expect(formatDateToPGN("1800-06-15")).toBe("1800.06.15");
  expect(formatDateToPGN("1000-12-25")).toBe("1000.12.25");
});

test("formatDateToPGN handles future dates", () => {
  expect(formatDateToPGN("2100-01-01")).toBe("2100.01.01");
  expect(formatDateToPGN("3000-06-15")).toBe("3000.06.15");
  expect(formatDateToPGN("9999-12-31")).toBe("9999.12.31");
});
