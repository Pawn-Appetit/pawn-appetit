// @ts-nocheck
import fs, { readFileSync } from "fs";
import { join } from "path";

interface TranslationData {
  language: { DisplayName: string };
  translation: Record<string, unknown>;
}

const BASE_PATH = "./src/locales/en";
const LOCALES_DIR = "./src/locales";

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
 * Updates translation files by inserting missing keys with "MISSING_KEY" placeholder
 */
function updateTranslations() {
  const lang = process.argv.find((arg) => arg.startsWith("--lang="))?.split("=")[1];

  // Get all locale directories
  const localeDirs = fs.readdirSync(LOCALES_DIR)
    .filter((dir) => {
      const dirPath = join(LOCALES_DIR, dir);
      return fs.statSync(dirPath).isDirectory() && dir !== "en";
    })
    .filter((dir) => {
      if (lang) return dir.includes(lang);
      return true;
    });

  localeDirs.forEach((langCode) => {
    const localePath = join(LOCALES_DIR, langCode);
    const missingFilePath = join(localePath, "missing.json");

    if (!fs.existsSync(missingFilePath)) {
      console.log(`[${langCode}] No missing translations file found, skipping.`);
      return;
    }

    const baseData = loadLocaleData(BASE_PATH);
    const translatedData = loadLocaleData(localePath);

    if (!baseData?.translation || !translatedData?.translation) {
      console.error(`[${langCode}] Invalid translation data structure, skipping.`);
      return;
    }

    let translation = { ...translatedData.translation };
    const missing = JSON.parse(fs.readFileSync(missingFilePath, "utf8"));

    let updatedCount = 0;

    // Function to insert missing keys at correct nested positions
    function insertMissingKeys(obj: Record<string, unknown>, missingObj: Record<string, unknown>, path = ""): Record<string, unknown> {
      const result = { ...obj };
      
      for (const [key, value] of Object.entries(missingObj)) {
        const fullKey = path ? `${path}.${key}` : key;
        
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          // Handle nested objects
          if (!result[key] || typeof result[key] !== "object") {
            result[key] = {};
          }
          result[key] = insertMissingKeys(
            result[key] as Record<string, unknown>, 
            value as Record<string, unknown>, 
            fullKey
          );
        } else {
          // Handle leaf values
          if (!(key in result)) {
            result[key] = "MISSING_KEY";
            console.log(`[${langCode}] Added missing key: ${fullKey}`);
            updatedCount++;
          }
        }
      }
      
      return result;
    }

    // Convert flat missing keys back to nested structure
    const nestedMissing = unflattenObject(missing);
    translation = insertMissingKeys(translation, nestedMissing);

    if (updatedCount > 0) {
      // Write updated common.json
      const commonJsonPath = join(localePath, "common.json");
      fs.writeFileSync(commonJsonPath, JSON.stringify(translation, null, 2), "utf8");
      console.log(`[${langCode}] Updated ${updatedCount} missing keys.`);
    } else {
      console.log(`[${langCode}] No missing keys to add.`);
    }
  });
}

/**
 * Converts a flat object with dot notation keys back to nested structure
 * @param flatObj - Flat object with dot notation keys
 * @returns Nested object
 */
function unflattenObject(flatObj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(flatObj)) {
    const keys = key.split('.');
    let current = result;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== 'object' || current[k] === null) {
        current[k] = {};
      }
      current = current[k] as Record<string, unknown>;
    }
    
    current[keys[keys.length - 1]] = value;
  }
  
  return result;
}

updateTranslations();
