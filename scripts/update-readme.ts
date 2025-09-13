// @ts-nocheck
import fs, { readFileSync } from "fs";
import { join } from "path";

const BASE_PATH = "./src/locales/en";

interface TranslationData {
  language: { DisplayName: string };
  translation: Record<string, unknown>;
}

interface TranslationProgress {
  [key: string]: number;
}

interface LanguageEmoji {
  [key: string]: string;
}

/**
 * Loads translation data from a locale directory
 * @param localePath - Path to the locale directory
 * @returns Parsed translation data
 * @throws Error if directory cannot be read or parsed
 */
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
      translation
    };
  } catch (error) {
    console.error(`Error loading locale data from ${localePath}:`, error);
    throw error;
  }
}

/**
 * Calculates translation progress percentage
 * @param basePath - Path to base locale directory
 * @param translatedPath - Path to translated locale directory
 * @returns Progress percentage
 */
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
        fs.writeFileSync(outPath, JSON.stringify(missingKeys, null, 2), "utf-8");
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

/**
 * Gets nested value from object using dot notation
 * @param obj - Object to search in
 * @param path - Dot notation path
 * @returns Value at path or undefined
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: unknown, key: string) => {
    return current && typeof current === 'object' && current !== null 
      ? (current as Record<string, unknown>)[key] 
      : undefined;
  }, obj);
}

/**
 * Flattens nested object structure
 * @param obj - Object to flatten
 * @param path - Current path (used in recursion)
 * @param res - Result accumulator (used in recursion)
 * @returns Flattened object
 */
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

const LANGUAGE_EMOJIS: LanguageEmoji = {
  hy: "🇦🇲", // Armenian
  be: "🇧🇾", // Belarusian
  zh: "🇨🇳", // Chinese
  de: "🇩🇪", // German
  en: "🇺🇸", // English
  fr: "🇫🇷", // French
  pl: "🇵🇱", // Polish
  nb: "🇳🇴", // Norwegian Bokmål
  pt: "🇵🇹", // Portuguese
  ru: "🇷🇺", // Russian
  es: "🇪🇸", // Spanish
  it: "🇮🇹", // Italian
  uk: "🇺🇦", // Ukrainian
  tr: "🇹🇷", // Turkish
  ja: "🇯🇵", // Japanese
  ar: "🇸🇦", // Arabic
};

/**
 * Generates markdown table for translation progress
 * @param translations - Translation progress data
 * @returns Markdown table string
 */
function generateMarkdown(translations: TranslationProgress): string {
  const rows = Object.entries(translations)
    .sort((a, b) => b[1] - a[1])
    .map(([langCode, percent]) => {
      const emoji = LANGUAGE_EMOJIS[langCode] || "🌐";
      const status = getStatusEmoji(percent);
      return `| ${emoji} ${langCode.toUpperCase()} | ${status} ${percent}% | [${langCode.toUpperCase()}](./src/locales/${langCode}) |`;
    });

  return [
    "| Language  | Status   | File                        |",
    "|-----------|----------|-----------------------------|",
    ...rows,
  ].join("\n");
}

/**
 * Returns status emoji based on completion percentage
 * @param percent - Completion percentage
 * @returns Status emoji
 */
function getStatusEmoji(percent: number): string {
  if (percent === 100) return "✅";
  if (percent >= 50) return "🟡";
  if (percent > 0) return "🔴";
  return "⚪";
}

/**
 * Updates README.md with translation progress
 */
function updateReadme(): void {
  try {
    const localesDir = "./src/locales";
    const langDirs = fs
      .readdirSync(localesDir)
      .filter((dir) => {
        const dirPath = join(localesDir, dir);
        return fs.statSync(dirPath).isDirectory() && dir !== "en";
      });

    const translations: TranslationProgress = {
      en: 100, // English is always 100% complete
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
