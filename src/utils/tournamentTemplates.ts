import { appDataDir, resolve } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { error, info } from "@tauri-apps/plugin-log";

export interface TournamentTemplate {
  id: string;
  accountName: string; // Associated with main account
  name: string;
  description: string;
  clockTime: number;
  clockIncrement: number;
  minutes: number;
  variant: string;
  rated: boolean;
  position: string;
  berserkable: boolean;
  streakable: boolean;
  hasChat: boolean;
  password: string;
  teamBattleByTeam: string;
  teamRestriction: string;
  conditions: {
    minRating: {
      enabled: boolean;
      rating: number;
    };
    maxRating: {
      enabled: boolean;
      rating: number;
    };
    nbRatedGame: {
      enabled: boolean;
      nb: number;
    };
  };
  createdAt: number;
}

const FILENAME = "tournament_templates.json";

export async function saveTournamentTemplate(
  template: Omit<TournamentTemplate, "id" | "createdAt">,
  accountName: string
): Promise<TournamentTemplate> {
  try {
    const dir = await appDataDir();
    info(`[tournamentTemplates] Saving tournament template to directory: ${dir}`);
    
    // Ensure directory exists
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
      info(`[tournamentTemplates] Created directory: ${dir}`);
    }
    
    const file = await resolve(dir, FILENAME);
    info(`[tournamentTemplates] Tournament templates file path: ${file}`);
    
    let templates: TournamentTemplate[] = [];
    try {
      if (await exists(file)) {
        const text = await readTextFile(file);
        templates = JSON.parse(text);
        info(`[tournamentTemplates] Loaded ${templates.length} existing tournament templates`);
      } else {
        info(`[tournamentTemplates] Tournament templates file does not exist, creating new one`);
      }
    } catch (err) {
      error(`[tournamentTemplates] Failed to read existing tournament templates: ${err}`);
      // Continue with empty array
    }
    
    const newTemplate: TournamentTemplate = {
      ...template,
      accountName,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    };
    
    templates.unshift(newTemplate);
    info(`[tournamentTemplates] Saving ${templates.length} tournament templates (added new template with id: ${newTemplate.id})`);
    
    await writeTextFile(file, JSON.stringify(templates, null, 2));
    info(`[tournamentTemplates] Successfully saved tournament templates to ${file}`);
    
    return newTemplate;
  } catch (err) {
    error(`[tournamentTemplates] Failed to save tournament template: ${err}`);
    throw err;
  }
}

export async function getTournamentTemplates(accountName: string): Promise<TournamentTemplate[]> {
  try {
    const dir = await appDataDir();
    info(`[tournamentTemplates] Loading tournament templates from directory: ${dir} for account: ${accountName}`);
    
    const file = await resolve(dir, FILENAME);
    info(`[tournamentTemplates] Tournament templates file path: ${file}`);
    
    // Check if file exists
    if (!(await exists(file))) {
      info(`[tournamentTemplates] Tournament templates file does not exist at ${file}`);
      return [];
    }
    
    try {
      const text = await readTextFile(file);
      info(`[tournamentTemplates] Read ${text.length} characters from tournament templates file`);
      
      const allTemplates: TournamentTemplate[] = JSON.parse(text);
      // Filter templates by account name (templates without accountName are ignored)
      const templates = allTemplates.filter((t) => t.accountName === accountName);
      info(`[tournamentTemplates] Found ${templates.length} tournament templates for account ${accountName} (out of ${allTemplates.length} total)`);
      
      return templates;
    } catch (err) {
      error(`[tournamentTemplates] Failed to read or parse tournament templates from ${file}: ${err}`);
      return [];
    }
  } catch (err) {
    error(`[tournamentTemplates] Failed to get tournament templates: ${err}`);
    return [];
  }
}

export async function deleteTournamentTemplate(id: string, accountName: string): Promise<void> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, FILENAME);
    
    let templates: TournamentTemplate[] = [];
    try {
      if (await exists(file)) {
        const text = await readTextFile(file);
        templates = JSON.parse(text);
      }
    } catch (err) {
      error(`[tournamentTemplates] Failed to read tournament templates: ${err}`);
      return;
    }
    
    // Only delete if it belongs to the current account
    const filteredTemplates = templates.filter((t) => !(t.id === id && t.accountName === accountName));
    await writeTextFile(file, JSON.stringify(filteredTemplates, null, 2));
    info(`[tournamentTemplates] Deleted tournament template ${id} for account ${accountName}`);
  } catch (err) {
    error(`[tournamentTemplates] Failed to delete tournament template: ${err}`);
    throw err;
  }
}

