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

    const indexContent = readFileSync(indexPath, "utf-8");
    const displayNameMatch = indexContent.match(/DisplayName:\s*"([^"]+)"/);
    const displayName = displayNameMatch ? displayNameMatch[1] : "Unknown";

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

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: unknown, key: string) => {
    return current && typeof current === 'object' && current !== null 
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
  en: { emoji: "🇺🇸", nativeName: "English", englishName: "English" },
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

/**
 * Generates markdown table for translation progress
 * @param translations - Translation progress data
 * @returns Markdown table string
 */
function generateMarkdown(translations: TranslationProgress): string {
  const sortedLanguages = Object.entries(translations)
    .sort((a, b) => b[1] - a[1])
    .map(([langCode, percent]) => ({ langCode, percent }));

  const chunks = [];
  for (let i = 0; i < sortedLanguages.length; i += 4) {
    chunks.push(sortedLanguages.slice(i, i + 4));
  }

  const rows = chunks.map(chunk => {
    const cells = chunk.map(({ langCode, percent }) => {
      const info = LANGUAGE_INFO[langCode];
      if (!info) {
        console.warn(`Missing language info for ${langCode}`);
        return generateLanguageCell(langCode, "🌐", langCode.toUpperCase(), percent);
      }
      return generateLanguageCell(langCode, info.emoji, info.nativeName, percent);
    });

    while (cells.length < 4) {
      cells.push('<td></td>');
    }

    return `    <tr>\n        ${cells.join('\n        ')}\n    </tr>`;
  });

  return [
    '<table>',
    ...rows,
    '</table>'
  ].join('\n');
}

function generateLanguageCell(langCode: string, emoji: string, displayName: string, percent: number): string {
  const colorClass = getColorClass(percent);
  const statusEmoji = getStatusEmoji(percent);
  
  return `<td align="center">
            <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${getEmojiCode(emoji)}.svg" width="24" height="18" alt="${emoji}" /><br />
            <strong>${displayName}</strong><br />
            <span style="color: ${colorClass};">${statusEmoji} ${percent}%</span><br />
            <a href="./src/locales/${langCode}">View</a>
        </td>`;
}

function getEmojiCode(emoji: string): string {
    return [...emoji].map(char => {
        const codePoint = char.codePointAt(0);
        return codePoint ? codePoint.toString(16).toLowerCase() : '';
    }).join('-');
}

function getColorClass(percent: number): string {
  if (percent === 100) return "#10B981";
  if (percent >= 50) return "#F59E0B";
  return "#EF4444";
}

function getStatusEmoji(percent: number): string {
  if (percent === 100) return "✅";
  if (percent >= 50) return "🟡";
  if (percent > 0) return "🔴";
  return "⚪";
}

/**
 * Calculate translation statistics from translation progress data
 * @param translations - Translation progress data
 * @returns Object containing translation statistics
 */
function calculateTranslationStats(translations: TranslationProgress): {
  totalLanguages: number;
  complete: number;
  inProgress: number;
  needHelp: number;
} {
  const percentages = Object.values(translations);
  const totalLanguages = percentages.length;
  const complete = percentages.filter(p => p === 100).length;
  const inProgress = percentages.filter(p => p >= 50 && p < 100).length;
  const needHelp = percentages.filter(p => p < 50).length;

  return { totalLanguages, complete, inProgress, needHelp };
}

/**
 * Generate Translation Stats badges markdown
 * @param stats - Translation statistics
 * @returns Markdown string for badges
 */
function generateTranslationStatsBadges(stats: {
  totalLanguages: number;
  complete: number;
  inProgress: number;
  needHelp: number;
}): string {
  return `![Translation Progress](https://img.shields.io/badge/Languages-${stats.totalLanguages}-blue?style=for-the-badge&logo=google-translate&logoColor=white)
![Complete Translations](https://img.shields.io/badge/Complete-${stats.complete}-success?style=for-the-badge&logo=checkmark&logoColor=white)
![In Progress](https://img.shields.io/badge/In_Progress-${stats.inProgress}-orange?style=for-the-badge&logo=progress&logoColor=white)
![Need Help](https://img.shields.io/badge/Need_Help-${stats.needHelp}-red?style=for-the-badge&logo=help&logoColor=white)`;
}

function updateReadme(): void {
  try {
    const localesDir = "./src/locales";
    
    if (!fs.existsSync(localesDir)) {
      throw new Error(`Locales directory not found: ${localesDir}`);
    }

    const langDirs = fs
      .readdirSync(localesDir)
      .filter((dir) => {
        const dirPath = join(localesDir, dir);
        return fs.statSync(dirPath).isDirectory() && dir !== "en";
      });

    if (langDirs.length === 0) {
      console.warn("No translation directories found besides English");
    }

    const translations: TranslationProgress = {
      en: 100,
    };

    for (const langCode of langDirs) {
      const percent = calculateTranslationProgress(BASE_PATH, `./src/locales/${langCode}`);
      translations[langCode] = percent;
    }

    const readmePath = "./README.md";
    if (!fs.existsSync(readmePath)) {
      throw new Error(`README.md not found at ${readmePath}`);
    }

    const readme = fs.readFileSync(readmePath, "utf-8");
    const table = generateMarkdown(translations);
    
    // Calculate translation statistics for badges
    const stats = calculateTranslationStats(translations);
    const statsBadges = generateTranslationStatsBadges(stats);

    const translationStartMarker = "<!-- TRANSLATIONS_START -->";
    const translationEndMarker = "<!-- TRANSLATIONS_END -->";
    
    if (!readme.includes(translationStartMarker) || !readme.includes(translationEndMarker)) {
      throw new Error("Translation markers not found in README.md");
    }

    // Update translation table
    let updated = readme.replace(
      /<!-- TRANSLATIONS_START -->[\s\S]*?<!-- TRANSLATIONS_END -->/,
      `${translationStartMarker}\n${table}\n${translationEndMarker}`,
    );

    // Update Translation Stats badges
    const badgePattern = /### 📊 Translation Stats\n\n[\s\S]*?(?=\n📢 Want to help translate\?)/;
    if (badgePattern.test(updated)) {
      updated = updated.replace(
        badgePattern,
        `### 📊 Translation Stats\n\n${statsBadges}\n`,
      );
      console.log("✅ Translation Stats badges updated.");
    } else {
      console.warn("⚠️  Translation Stats section pattern not found - badges not updated");
    }

    fs.writeFileSync(readmePath, updated);
    console.log("✅ Translations section updated.");
  } catch (error) {
    console.error("Error updating README:", error);
    process.exit(1);
  }
}

updateReadme();
