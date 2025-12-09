import { appDataDir, resolve } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

export interface MainAccount {
  name: string;
  fideId?: string;
  updatedAt?: string;
}

const FILENAME = "main_account.json";

export async function saveMainAccount(account: MainAccount): Promise<void> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, FILENAME);
    const accountWithTimestamp = {
      ...account,
      updatedAt: new Date().toISOString(),
    };
    await writeTextFile(file, JSON.stringify(accountWithTimestamp, null, 2));
    // Also save to localStorage for backward compatibility
    localStorage.setItem("mainAccount", account.name);
  } catch (error) {
    console.error("Error saving main account:", error);
    throw error;
  }
}

export async function loadMainAccount(): Promise<MainAccount | null> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, FILENAME);
    const text = await readTextFile(file);
    if (!text || text.trim() === "") {
      // Fallback to localStorage for backward compatibility
      const name = localStorage.getItem("mainAccount");
      if (name) {
        return { name };
      }
      return null;
    }
    return JSON.parse(text) as MainAccount;
  } catch (error) {
    // File doesn't exist, try localStorage
    const name = localStorage.getItem("mainAccount");
    if (name) {
      return { name };
    }
    return null;
  }
}

export async function updateMainAccountFideId(fideId: string | null): Promise<void> {
  try {
    const account = await loadMainAccount();
    if (account) {
      if (fideId) {
        account.fideId = fideId;
      } else {
        delete account.fideId;
      }
      await saveMainAccount(account);
    }
  } catch (error) {
    console.error("Error updating main account FIDE ID:", error);
  }
}
