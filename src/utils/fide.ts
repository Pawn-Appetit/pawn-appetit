export interface FidePlayer {
  fideId: string;
  name: string;
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  title?: string;
  rating?: number;
  federation?: string;
  standardRating?: number;
  rapidRating?: number;
  blitzRating?: number;
  worldRank?: number;
  nationalRank?: number;
  photo?: string;
  birthYear?: number;
  age?: number;
}

const TITLE_MAP: Record<string, string> = {
  GRANDMASTER: "GM",
  "INTERNATIONAL MASTER": "IM",
  "FIDE MASTER": "FM",
  "CANDIDATE MASTER": "CM",
  "WOMAN GRANDMASTER": "WGM",
  "WOMAN INTERNATIONAL MASTER": "WIM",
  "WOMAN FIDE MASTER": "WFM",
  "WOMAN CANDIDATE MASTER": "WCM",
  "NATIONAL MASTER": "NM",
  "WOMAN NATIONAL MASTER": "WNM",
};

const TITLE_ABBREVIATIONS = /^(GM|IM|FM|CM|WGM|WIM|WFM|WCM|NM|WNM)\b/i;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseNumber(value: string | null | undefined): number | undefined {
  const v = value?.match(/\b\d+\b/)?.[0];
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function extractName(doc: Document): string | null {
  const selectors = [".player-title", "h1.player-title", ".profile-top-title", "h1.profile-top-title", ".player-name", "h1"];

  for (const selector of selectors) {
    const text = doc.querySelector(selector)?.textContent;
    const normalized = text ? normalizeWhitespace(text) : "";
    if (normalized.length >= 2) return normalized;
  }

  const titleText = normalizeWhitespace(doc.querySelector("title")?.textContent ?? "");
  const match = titleText.match(/^([^-]+)/);
  return match?.[1] ? normalizeWhitespace(match[1]) : null;
}

function splitName(fullName: string) {
  const name = normalizeWhitespace(fullName);
  if (name.includes(",")) {
    const [last, first] = name.split(",", 2).map((p) => normalizeWhitespace(p));
    return { firstName: first ?? "", lastName: last ?? "" };
  }

  const parts = name.split(" ").filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

function extractTitleFromText(text: string): string | undefined {
  const match = text.match(TITLE_ABBREVIATIONS);
  return match?.[1]?.toUpperCase();
}

function extractTitleFromProfile(doc: Document): string | undefined {
  const titleText = normalizeWhitespace(doc.querySelector(".profile-info-title p")?.textContent ?? "");
  if (!titleText) return undefined;

  const abbrev = extractTitleFromText(titleText);
  if (abbrev) return abbrev;

  const upper = titleText.toUpperCase();
  for (const [fullName, code] of Object.entries(TITLE_MAP)) {
    if (upper.includes(fullName)) return code;
  }
  return undefined;
}

function extractGender(doc: Document, title?: string): "male" | "female" {
  const text = normalizeWhitespace(doc.querySelector(".profile-info-sex")?.textContent ?? "").toLowerCase();
  if (text === "female" || text === "f") return "female";
  if (text === "male" || text === "m") return "male";

  if (title && title.startsWith("W")) return "female";
  return "male";
}

function extractBirthYear(doc: Document): number | undefined {
  const year = parseNumber(doc.querySelector(".profile-info-byear")?.textContent);
  if (!year) return undefined;

  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear) return undefined;
  return year;
}

function extractFederation(doc: Document): string | undefined {
  const element = doc.querySelector(".profile-info-country");
  if (!element) return undefined;

  const text = normalizeWhitespace(element.textContent ?? "");
  return text || undefined;
}

function extractRating(doc: Document, selector: string): number | undefined {
  const ratingText =
    doc.querySelector(`${selector} p`)?.textContent ??
    doc.querySelector(`${selector} p:first-of-type`)?.textContent ??
    undefined;
  const rating = parseNumber(ratingText);
  if (!rating) return undefined;
  if (rating < 0 || rating > 4000) return undefined;
  return rating;
}

function extractRank(doc: Document, label: string): number | undefined {
  const blocks = Array.from(doc.querySelectorAll(".profile-rank-block"));
  const block = blocks.find((b) => normalizeWhitespace(b.querySelector("h5")?.textContent ?? "") === label);
  const value = block?.querySelector(".profile-rank-row p")?.textContent;
  const rank = parseNumber(value);
  if (!rank) return undefined;
  if (rank < 0 || rank > 10_000_000) return undefined;
  return rank;
}

function extractPhoto(doc: Document): string | undefined {
  const src = doc.querySelector<HTMLImageElement>(".profile-top__photo")?.src;
  if (!src) return undefined;
  return src.trim() || undefined;
}

export async function fetchFidePlayer(fideId: string): Promise<FidePlayer | null> {
  const { invoke } = await import("@tauri-apps/api/core");

  let html: string;
  try {
    html = await invoke<string>("fetch_fide_profile_html", { fideId });
  } catch {
    return null;
  }

  if (!html || html.length < 200) return null;

  const doc = new DOMParser().parseFromString(html, "text/html");

  let fullName = extractName(doc);
  if (!fullName) return null;

  let title = extractTitleFromText(fullName);
  if (title) {
    fullName = normalizeWhitespace(fullName.replace(TITLE_ABBREVIATIONS, ""));
  } else {
    title = extractTitleFromProfile(doc);
  }

  const { firstName, lastName } = splitName(fullName);
  const birthYear = extractBirthYear(doc);
  const age = birthYear ? new Date().getFullYear() - birthYear : undefined;
  const federation = extractFederation(doc);
  const standardRating = extractRating(doc, ".profile-standart");
  const rapidRating = extractRating(doc, ".profile-rapid");
  const blitzRating = extractRating(doc, ".profile-blitz");
  const gender = extractGender(doc, title);
  const worldRank = extractRank(doc, "World Rank");
  const nationalRank = extractRank(doc, "National Rank");
  const photo = extractPhoto(doc);

  return {
    fideId,
    name: fullName,
    firstName,
    lastName,
    gender,
    title,
    rating: standardRating,
    standardRating,
    rapidRating,
    blitzRating,
    federation,
    worldRank,
    nationalRank,
    photo,
    birthYear,
    age,
  };
}

