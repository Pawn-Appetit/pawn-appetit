import fs, { readFileSync } from "fs";
import { basename } from "path";
import * as ts from "typescript";

const BASE_PATH = "./src/translation/en_US.ts";

interface TranslationData {
  language: { DisplayName: string };
  translation: Record<string, any>;
}

interface TranslationProgress {
  [key: string]: number;
}

interface LanguageEmoji {
  [key: string]: string;
}

/**
 * Extracts exported translation data from a TypeScript file
 * @param filePath - Path to the TypeScript file
 * @returns Parsed translation data
 * @throws Error if file cannot be read or parsed
 */
export function extractExportByFilename(filePath: string): TranslationData | undefined {
  try {
    const content = readFileSync(filePath, "utf-8");
    const fileNameWithoutExt = basename(filePath, ".ts");

    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

    let result;

    sourceFile.forEachChild((node) => {
      if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        node.declarationList.declarations.forEach((decl) => {
          if (
            ts.isIdentifier(decl.name) &&
            decl.name.text === fileNameWithoutExt &&
            decl.initializer &&
            ts.isObjectLiteralExpression(decl.initializer)
          ) {
            // Using Function constructor instead of eval for better security
            result = new Function(`return ${decl.initializer.getText()}`)();
          }
        });
      }
    });

    return result;
  } catch (error) {
    console.error(`Error extracting data from ${filePath}:`, error);
    throw error;
  }
}

/**
 * Calculates translation progress percentage
 * @param basePath - Path to base translation file
 * @param translatedPath - Path to translated file
 * @returns Progress percentage
 */
function calculateTranslationProgress(basePath: string, translatedPath: string): number {
  try {
    const baseData = extractExportByFilename(basePath);
    const translatedData = extractExportByFilename(translatedPath);

    if (!baseData?.translation || !translatedData?.translation) {
      throw new Error("Invalid translation data structure");
    }

    const base = baseData.translation;
    const translated = translatedData.translation;

    const baseKeys = Object.keys(flatten(base));
    const translatedKeys = Object.keys(flatten(translated));

    const missingKeys = {};

    const translatedCount = baseKeys.reduce((count, key) => {
      const hasTranslation =
        translatedKeys.includes(key) &&
        translated[key] !== "" &&
        translated[key] !== "MISSING_KEY" &&
        translated[key] !== null &&
        translated[key] !== undefined;

      if (!hasTranslation) {
        missingKeys[key] = base[key];
      }

      return count + (hasTranslation ? 1 : 0);
    }, 0);

    try {
      const langName = basename(translatedPath, ".ts");
      const outPath = `./src/translation/missing/${langName}.json`;
      fs.writeFileSync(outPath, JSON.stringify(missingKeys, null, 2), "utf-8");
      console.log(`Missing keys written to ${outPath}`);
    } catch (err) {
      console.error("Error writing missing keys file:", err);
    }

    return Math.round((translatedCount / baseKeys.length) * 100);
  } catch (error) {
    console.error("Error calculating translation progress:", error);
    return 0;
  }
}

/**
 * Flattens nested object structure
 * @param obj - Object to flatten
 * @param path - Current path (used in recursion)
 * @param res - Result accumulator (used in recursion)
 * @returns Flattened object
 */
function flatten(obj: Record<string, any>, path = "", res: Record<string, any> = {}): Record<string, any> {
  for (const key of Object.keys(obj)) {
    const newPath = path ? `${path}.${key}` : key;
    if (typeof obj[key] === "object" && obj[key] !== null) {
      flatten(obj[key], newPath, res);
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
    .map(([lang, percent]) => {
      const [langCode, language] = lang.split("_");
      const emoji = LANGUAGE_EMOJIS[langCode] || "🌐";
      const status = getStatusEmoji(percent);
      return `| ${emoji} ${language} | ${status} ${percent}% | [${language}](./src/translation/${lang}.ts) |`;
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
    const langs = fs
      .readdirSync("./src/translation")
      .filter((file) => file.endsWith(".ts") && file !== "en_US.ts")
      .map((file) => file.replace(".ts", ""));

    const translations: TranslationProgress = {
      en_US: 100, // English is always 100% complete
    };

    for (const lang of langs) {
      const percent = calculateTranslationProgress(BASE_PATH, `./src/translation/${lang}.ts`);
      translations[lang] = percent;
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
