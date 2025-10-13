// @ts-nocheck
import fs, { readFileSync } from "fs";
import { join } from "path";

const BASE_PATH = "./src/locales/en-US";

interface TranslationData {
  language: { DisplayName: string };
  translation: Record<string, unknown>;
}

interface TranslationProgress {
  [key: string]: number;
}

interface LanguageInfo {
  emoji: string;
  nativeName: string;
  englishName: string;
}

interface LanguageMapping {
  [key: string]: LanguageInfo;
}

export function loadLocaleData(localePath: string): TranslationData | undefined {
  try {
    const indexPath = join(localePath, "index.ts");
    const commonJsonPath = join(localePath, "common.json");

    if (!fs.existsSync(indexPath) || !fs.existsSync(commonJsonPath)) {
      console.warn(`Missing files in ${localePath}`);
      return undefined;
    }

    // Read the display name from index.ts
    const indexContent = readFileSync(indexPath, "utf-8");
    const displayNameMatch = indexContent.match(/DisplayName:\s*"([^"]+)"/);
    const displayName = displayNameMatch ? displayNameMatch[1] : "Unknown";

    // Read the translation data from common.json
    const commonContent = readFileSync(commonJsonPath, "utf-8");
    const translation = JSON.parse(commonContent);

    return {
      language: { DisplayName: displayName },
      translation,
    };
  } catch (error) {
    console.error(`Error loading locale data from ${localePath}:`, error);
    throw error;
  }
}

function calculateTranslationProgress(basePath: string, translatedPath: string): number {
  try {
    const baseData = loadLocaleData(basePath);
    const translatedData = loadLocaleData(translatedPath);

    if (!baseData?.translation || !translatedData?.translation) {
      throw new Error("Invalid translation data structure");
    }

    const base = baseData.translation;
    const translated = translatedData.translation;

    const baseKeys = Object.keys(flatten(base));
    const translatedKeys = Object.keys(flatten(translated));

    const missingKeys: Record<string, unknown> = {};

    const translatedCount = baseKeys.reduce((count, key) => {
      const translatedValue = getNestedValue(translated, key);
      const hasTranslation =
        translatedKeys.includes(key) &&
        translatedValue !== "" &&
        translatedValue !== "MISSING_KEY" &&
        translatedValue !== null &&
        translatedValue !== undefined;

      if (!hasTranslation) {
        missingKeys[key] = getNestedValue(base, key);
      }

      return count + (hasTranslation ? 1 : 0);
    }, 0);

    // Write missing keys file if there are missing translations
    if (Object.keys(missingKeys).length > 0) {
      try {
        const outPath = join(translatedPath, "missing.json");
        fs.writeFileSync(outPath, JSON.stringify(missingKeys, null, 2) + '\n', "utf-8");
        console.log(`Missing keys written to ${outPath}`);
      } catch (err) {
        console.error("Error writing missing keys file:", err);
      }
    }

    return Math.round((translatedCount / baseKeys.length) * 100);
  } catch (error) {
    console.error("Error calculating translation progress:", error);
    return 0;
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current: unknown, key: string) => {
    return current && typeof current === "object" && current !== null
      ? (current as Record<string, unknown>)[key]
      : undefined;
  }, obj);
}

function flatten(obj: Record<string, unknown>, path = "", res: Record<string, unknown> = {}): Record<string, unknown> {
  for (const key of Object.keys(obj)) {
    const newPath = path ? `${path}.${key}` : key;
    if (typeof obj[key] === "object" && obj[key] !== null && !Array.isArray(obj[key])) {
      flatten(obj[key] as Record<string, unknown>, newPath, res);
    } else {
      res[newPath] = obj[key];
    }
  }
  return res;
}

const LANGUAGE_INFO: LanguageMapping = {
  hy: { emoji: "🇦🇲", nativeName: "Հայերեն", englishName: "Armenian" },
  be: { emoji: "🇧🇾", nativeName: "Беларуская", englishName: "Belarusian" },
  zh: { emoji: "🇨🇳", nativeName: "中文", englishName: "Chinese" },
  de: { emoji: "🇩🇪", nativeName: "Deutsch", englishName: "German" },
  "en-US": { emoji: "🇺🇸", nativeName: "English US", englishName: "English US" },
  "en-GB": { emoji: "🇬🇧", nativeName: "English UK", englishName: "English UK" },
  fr: { emoji: "🇫🇷", nativeName: "Français", englishName: "French" },
  pl: { emoji: "🇵🇱", nativeName: "Polski", englishName: "Polish" },
  nb: { emoji: "🇳🇴", nativeName: "Norsk", englishName: "Norwegian Bokmål" },
  pt: { emoji: "🇵🇹", nativeName: "Português", englishName: "Portuguese" },
  ru: { emoji: "🇷🇺", nativeName: "Русский", englishName: "Russian" },
  es: { emoji: "🇪🇸", nativeName: "Español", englishName: "Spanish" },
  it: { emoji: "🇮🇹", nativeName: "Italiano", englishName: "Italian" },
  uk: { emoji: "🇺🇦", nativeName: "Українська", englishName: "Ukrainian" },
  tr: { emoji: "🇹🇷", nativeName: "Türkçe", englishName: "Turkish" },
  ja: { emoji: "🇯🇵", nativeName: "日本語", englishName: "Japanese" },
  ar: { emoji: "🇸🇦", nativeName: "العربية", englishName: "Arabic" },
};

function generateMarkdown(translations: TranslationProgress): string {
  const rows = Object.entries(translations)
    .sort((a, b) => b[1] - a[1])
    .map(([langCode, percent]) => {
      const emoji = LANGUAGE_INFO[langCode].emoji || "🌐";
      const status = getStatusEmoji(percent);
      const displayName =
        langCode === "en-US" || langCode === "en-GB"
          ? `${LANGUAGE_INFO[langCode].nativeName}`
          : `${LANGUAGE_INFO[langCode].nativeName} (${LANGUAGE_INFO[langCode].englishName})`;

      return `| ${emoji} **${displayName}** | ${status} ${percent}% | [View](./src/locales/${langCode}) |`;
    });

  return [
    "| Language  | Progress   | Link                        |",
    "|-----------|----------|-----------------------------|",
    ...rows,
  ].join("\n");
}

function getStatusEmoji(percent: number): string {
  if (percent === 100) return "✅";
  if (percent >= 50) return "🟡";
  if (percent > 0) return "🔴";
  return "⚪";
}

function updateReadme(): void {
  try {
    const localesDir = "./src/locales";
    const langDirs = fs.readdirSync(localesDir).filter((dir) => {
      const dirPath = join(localesDir, dir);
      return fs.statSync(dirPath).isDirectory() && dir !== "en-US";
    });

    const translations: TranslationProgress = {
      "en-US": 100, // English is always 100% complete
    };

    for (const langCode of langDirs) {
      const percent = calculateTranslationProgress(BASE_PATH, `./src/locales/${langCode}`);
      translations[langCode] = percent;
    }

    const readme = fs.readFileSync("./README.md", "utf-8");
    const table = generateMarkdown(translations);

    const updated = readme.replace(
      /<!-- TRANSLATIONS_START -->[\s\S]*?<!-- TRANSLATIONS_END -->/,
      `<!-- TRANSLATIONS_START -->\n${table}\n<!-- TRANSLATIONS_END -->`,
    );

    fs.writeFileSync("./README.md", updated);
    console.log("✅ Translations section updated.");
  } catch (error) {
    console.error("Error updating README:", error);
    process.exit(1);
  }
}

updateReadme();
