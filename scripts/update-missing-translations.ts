import fs, { readFileSync } from "fs";
import path, { basename } from "path";
import * as ts from "typescript";

interface TranslationData {
  language: {"DisplayName": string},
  translation: Record<string, any>;
}

const BASE_PATH = "./src/translation/en_US.ts";
const TRANSLATION_DIR = "./src/translation";
const MISSING_DIR = path.join(TRANSLATION_DIR, "missing");

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

function updateTranslations() {
  const lang = process.argv.find((arg) => arg.startsWith("--lang="))?.split("=")[1];

  const files = fs.readdirSync(TRANSLATION_DIR);

  files.filter((file) => {
    if (lang) return file.includes(lang);
    return true;
  }).forEach((file) => {
    const filePath = path.join(TRANSLATION_DIR, file);
    const missingFilePath = path.join(MISSING_DIR, file.replace(".ts", ".json"));

    if (!fs.existsSync(missingFilePath)) return;

    const baseData = extractExportByFilename(BASE_PATH);
    const translatedData = extractExportByFilename(filePath);

    if (!baseData?.translation || !translatedData?.translation) {
      throw new Error("Invalid translation data structure");
    }

    const base = baseData.translation;
    let translation = translatedData.translation;
    const missing = JSON.parse(fs.readFileSync(missingFilePath, "utf8"));

    function insertKeyAt(obj, key, value, index) {
      const entries = Object.entries(obj);
      entries.splice(index, 0, [key, value]);
      return Object.fromEntries(entries);
    }

    Object.keys(base).forEach((key) => {
      if (key in missing) {
        translation = insertKeyAt(translation, key, "MISSING_KEY", Object.keys(base).indexOf(key));
        console.log(`[${file}] Added missing key: ${key}`);
      }
    });

    const fileNameWithoutExt = path.basename(filePath, ".ts");
    const translationContent = {
      language: { "DisplayName": translatedData.language?.DisplayName || `MISSING_${fileNameWithoutExt}` },
      translation
    }
    const fileContent = `export const ${fileNameWithoutExt} = ${JSON.stringify(translationContent, null, 2)};\n`;
    fs.writeFileSync(filePath, fileContent, "utf8");
    console.log(`[${file}] Updated.`);
  });
}

updateTranslations();
