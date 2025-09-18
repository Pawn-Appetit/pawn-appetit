export function capitalize(str: string) {
  return `${str.charAt(0).toUpperCase()}${str.slice(1)}`;
}

// i18next formatter functions
export function createBytesFormatter(i18n: {
  t: (key: string, options?: { lng?: string }) => string;
  language: string;
}) {
  return (value: unknown, lng?: string, options?: { decimals?: number }) => {
    const bytes = Math.abs(Number(value));
    const decimals = options?.decimals !== undefined ? options.decimals : 2;
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const currentLng = lng || i18n.language;
    const sizes = [
      i18n.t("units.bytesLabels.bytes", { lng: currentLng }),
      i18n.t("units.bytesLabels.kilobytes", { lng: currentLng }),
      i18n.t("units.bytesLabels.megabytes", { lng: currentLng }),
      i18n.t("units.bytesLabels.gigabytes", { lng: currentLng }),
      i18n.t("units.bytesLabels.terabytes", { lng: currentLng }),
    ];

    if (bytes === 0) {
      return `0 ${sizes[0]}`;
    }

    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    const formattedValue = (bytes / k ** i).toFixed(dm);
    return `${formattedValue} ${sizes[i]}`;
  };
}

export function createBytesLongFormatter(i18n: {
  t: (key: string, options?: { lng?: string }) => string;
  language: string;
}) {
  return (value: unknown, lng?: string, options?: { decimals?: number }) => {
    const bytes = Math.abs(Number(value));
    const decimals = options?.decimals || 2;
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const currentLng = lng || i18n.language;
    const sizes = [
      i18n.t("units.bytesLabels.bytesLong", { lng: currentLng }),
      i18n.t("units.bytesLabels.kilobytesLong", { lng: currentLng }),
      i18n.t("units.bytesLabels.megabytesLong", { lng: currentLng }),
      i18n.t("units.bytesLabels.gigabytesLong", { lng: currentLng }),
      i18n.t("units.bytesLabels.terabytesLong", { lng: currentLng }),
    ];

    if (bytes === 0) {
      return `0 ${sizes[0]}`;
    }

    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    const formattedValue = (bytes / k ** i).toFixed(dm);
    return `${formattedValue} ${sizes[i]}`;
  };
}

export function createNodesFormatter(i18n: {
  t: (key: string, options?: { lng?: string }) => string;
  language: string;
}) {
  return (value: unknown, lng?: string) => {
    const nodes = Math.abs(Number(value));
    if (nodes < 1) return nodes.toExponential(2);

    const currentLng = lng || i18n.language;
    const units = [
      "",
      i18n.t("units.nodesLabels.thousand", { lng: currentLng }),
      i18n.t("units.nodesLabels.million", { lng: currentLng }),
      i18n.t("units.nodesLabels.billion", { lng: currentLng }),
      i18n.t("units.nodesLabels.trillion", { lng: currentLng }),
      i18n.t("units.nodesLabels.quadrillion", { lng: currentLng }),
      i18n.t("units.nodesLabels.quintillion", { lng: currentLng }),
    ];
    let i = 0;
    let nodeValue = nodes;

    while (nodeValue >= 1000 && i < units.length - 1) {
      nodeValue /= 1000;
      i++;
    }

    const formattedValue = nodeValue % 1 === 0 ? nodeValue.toFixed(0) : nodeValue.toFixed(1);
    return `${formattedValue}${units[i]}`;
  };
}

export function createNodesLongFormatter(i18n: {
  t: (key: string, options?: { lng?: string }) => string;
  language: string;
}) {
  return (value: unknown, lng?: string) => {
    const nodes = Math.abs(Number(value));
    const currentLng = lng || i18n.language;
    return `${nodes.toLocaleString()} ${i18n.t("units.nodesLabels.nodes", { lng: currentLng })}`;
  };
}

export function createDurationFormatter(i18n: {
  t: (key: string, options?: { lng?: string }) => string;
  language: string;
}) {
  return (value: unknown, lng?: string) => {
    const ms = Number(value);
    const currentLng = lng || i18n.language;

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const secondsRemainder = seconds % 60;
    const minutesRemainder = minutes % 60;
    const hoursRemainder = hours % 24;
    const parts: string[] = [];
    if (hoursRemainder > 0) parts.push(`${hoursRemainder}${i18n.t("units.durationLabels.hours", { lng: currentLng })}`);
    if (minutesRemainder > 0)
      parts.push(`${minutesRemainder}${i18n.t("units.durationLabels.minutes", { lng: currentLng })}`);
    if (secondsRemainder > 0)
      parts.push(`${secondsRemainder}${i18n.t("units.durationLabels.seconds", { lng: currentLng })}`);
    return parts.join(" ") || `0${i18n.t("units.durationLabels.seconds", { lng: currentLng })}`;
  };
}

export function createDurationLongFormatter(i18n: {
  t: (key: string, options?: { lng?: string }) => string;
  language: string;
}) {
  return (value: unknown, lng?: string) => {
    const ms = Number(value);
    const currentLng = lng || i18n.language;

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const secondsRemainder = seconds % 60;
    const minutesRemainder = minutes % 60;
    const hoursRemainder = hours % 24;
    const parts: string[] = [];
    if (hoursRemainder > 0)
      parts.push(`${hoursRemainder} ${i18n.t("units.durationLabels.hoursLong", { lng: currentLng })}`);
    if (minutesRemainder > 0)
      parts.push(`${minutesRemainder} ${i18n.t("units.durationLabels.minutesLong", { lng: currentLng })}`);
    if (secondsRemainder > 0)
      parts.push(`${secondsRemainder} ${i18n.t("units.durationLabels.secondsLong", { lng: currentLng })}`);
    return parts.join(", ") || `0 ${i18n.t("units.durationLabels.secondsLong", { lng: currentLng })}`;
  };
}

export function createScoreFormatter(i18n: {
  t: (key: string, options?: { lng?: string }) => string;
  language: string;
}) {
  return (value: unknown, lng?: string, options?: { precision?: number }) => {
    const score = value as { type: "cp" | "mate" | "dtz"; value: number };
    const precision = options?.precision || 2;
    const currentLng = lng || i18n.language;

    let scoreText = "";
    if (score.type === "cp") {
      scoreText = Math.abs(score.value / 100).toFixed(precision);
    } else if (score.type === "mate") {
      scoreText = `${i18n.t("units.scoreLabels.mate", { lng: currentLng })}${Math.abs(score.value)}`;
    } else if (score.type === "dtz") {
      scoreText = `${i18n.t("units.scoreLabels.dtz", { lng: currentLng })}${Math.abs(score.value)}`;
    }

    if (score.type !== "dtz") {
      if (score.value > 0) {
        scoreText = `+${scoreText}`;
      }
      if (score.value < 0) {
        scoreText = `-${scoreText}`;
      }
    }

    return scoreText;
  };
}

export function createDateFormatter(
  _i18n: {
    t: (key: string, options?: { lng?: string }) => string;
    language: string;
  },
  storage?: Storage,
) {
  return (value: unknown, lng?: string, options?: { timeZone?: string }): string => {
    if (!(value instanceof Date)) return String(value);

    try {
      const mode = storage?.getItem("dateFormatMode") || "intl";

      if (mode === "intl") {
        const formatOptions: Intl.DateTimeFormatOptions = {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour12: false,
          ...(options?.timeZone && { timeZone: options.timeZone }),
        };

        return new Intl.DateTimeFormat("en-CA", formatOptions).format(value);
      }

      const formatOptions: Intl.DateTimeFormatOptions = {
        dateStyle: "short",
        ...(options?.timeZone && { timeZone: options.timeZone }),
      };

      return new Intl.DateTimeFormat(lng?.replace("_", "-"), formatOptions).format(value);
    } catch {
      // Fallback to simple date formatting if localStorage or Intl.DateTimeFormat fails
      return value.toLocaleDateString(lng?.replace("_", "-"));
    }
  };
}

export function createDatetimeFormatter(
  _i18n: {
    t: (key: string, options?: { lng?: string }) => string;
    language: string;
  },
  storage?: Storage,
) {
  return (value: unknown, lng?: string, options?: { timeZone?: string }): string => {
    if (!(value instanceof Date)) return String(value);

    try {
      const mode = storage?.getItem("dateFormatMode") || "intl";

      const formatOptions: Intl.DateTimeFormatOptions = {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        ...(options?.timeZone && { timeZone: options.timeZone }),
      };
      if (mode === "intl") {
        // YYYY-MM-DD HH:mm
        return new Intl.DateTimeFormat("en-CA", formatOptions).format(value);
      }

      return new Intl.DateTimeFormat(lng?.replace("_", "-"), formatOptions).format(value);
    } catch {
      // Fallback to simple date formatting if localStorage or Intl.DateTimeFormat fails
      return value.toLocaleDateString(lng?.replace("_", "-"));
    }
  };
}

/**
 * Parses a date input and returns a Date object
 * @param dateInput - Date string, Date object, or timestamp number
 * @returns Date object or undefined if invalid
 */
export function parseDate(dateInput: string | Date | number | null | undefined): Date | undefined {
  if (dateInput === null || dateInput === undefined) {
    return undefined;
  }

  if (dateInput instanceof Date) {
    return Number.isNaN(dateInput.getTime()) ? undefined : dateInput;
  }

  if (typeof dateInput === "number") {
    const date = new Date(dateInput);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  if (typeof dateInput !== "string") {
    return undefined;
  }

  try {
    let normalized = dateInput.trim();
    if (/^\d{4}\.\d{2}\.\d{2}$/.test(normalized)) {
      normalized = normalized.replace(/\./g, "-");
    }

    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? undefined : date;
  } catch {
    return undefined;
  }
}

/**
 * Formats a date input to YYYY.MM.DD format for PGN storage
 * @param date - Date object, date string, or timestamp number to format
 * @returns Formatted date string or undefined if invalid
 */
export function formatDateToPGN(date: Date | string | number | null | undefined): string | undefined {
  if (date === null || date === undefined) {
    return undefined;
  }

  let dateObj: Date;
  if (typeof date === "string") {
    dateObj = new Date(date);
  } else if (typeof date === "number") {
    dateObj = new Date(date);
  } else if (date instanceof Date) {
    dateObj = date;
  } else {
    return undefined;
  }

  if (Number.isNaN(dateObj.getTime())) {
    return undefined;
  }

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");

  return `${year}.${month}.${day}`;
}

// Wrapper because we're outside of a React component
function getFromAtomWithStorage<T>(storage: Storage, key: string, initialValue: T): T {
  const storedValue = storage.getItem(key);
  if (storedValue === null) {
    return initialValue;
  }
  try {
    const parsed = JSON.parse(storedValue);
    return parsed;
  } catch {
    return initialValue;
  }
}

const PIECE_SYMBOLS = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };
const TRANSLATED_PIECE_CHARS_CACHE = new Map<string, { K: string; Q: string; R: string; B: string; N: string }>();

export function hasTranslatedPieceChars(
  i18n: {
    t: (key: string, options?: { lng?: string }) => string;
    language: string;
  },
  lng?: string,
): boolean {
  const currentLng = lng || i18n.language;

  return Object.keys(PIECE_SYMBOLS).some((key) => {
    const translatedChar = i18n.t(`PieceChars.${key}`, { lng: currentLng });
    return key.toLowerCase() !== translatedChar.toLowerCase();
  });
}

export function createMoveNotationFormatter(
  i18n: {
    t: (key: string, options?: { lng?: string }) => string;
    language: string;
  },
  storage?: Storage,
) {
  return (
    value: unknown,
    lng?: string,
    options?: { notationType?: "letters" | "symbols" | "letters-translated" },
  ): string => {
    const move = String(value);
    const notationType =
      options?.notationType ||
      (storage
        ? getFromAtomWithStorage<"letters" | "symbols" | "letters-translated">(storage, "letters", "symbols")
        : "symbols");
    const currentLng = lng || i18n.language;

    switch (notationType) {
      case "symbols": {
        const pieceChar = PIECE_SYMBOLS[move[0] as keyof typeof PIECE_SYMBOLS];
        if (typeof pieceChar === "undefined") return move;
        return pieceChar + move.slice(1);
      }
      case "letters-translated": {
        let translatedPieceChars = TRANSLATED_PIECE_CHARS_CACHE.get(currentLng);
        if (!translatedPieceChars) {
          translatedPieceChars = {
            K: i18n.t("chess.pieceChars.k", { lng: currentLng }),
            Q: i18n.t("chess.pieceChars.q", { lng: currentLng }),
            R: i18n.t("chess.pieceChars.r", { lng: currentLng }),
            B: i18n.t("chess.pieceChars.b", { lng: currentLng }),
            N: i18n.t("chess.pieceChars.n", { lng: currentLng }),
          };
          TRANSLATED_PIECE_CHARS_CACHE.set(currentLng, translatedPieceChars);
        }
        const pieceChar = translatedPieceChars[move[0] as keyof typeof translatedPieceChars];
        if (typeof pieceChar === "undefined") return move;
        return pieceChar + move.slice(1);
      }
      default:
        return move;
    }
  };
}
