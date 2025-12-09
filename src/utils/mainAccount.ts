import { appDataDir, resolve } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

export interface MainAccount {
  name: string;
  fideId?: string;
  displayName?: string;
  updatedAt?: string;
}

export interface AccountFideIds {
  [accountName: string]: string; // Maps account name to FIDE ID
}

export interface AccountDisplayNames {
  [accountName: string]: string; // Maps account name to display name
}

const FILENAME = "main_account.json";
const FIDE_IDS_FILENAME = "account_fide_ids.json";
const DISPLAY_NAMES_FILENAME = "account_display_names.json";

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
    
    // Trigger custom event for dashboard to listen
    window.dispatchEvent(new CustomEvent("mainAccountChanged", { detail: account }));
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
    const account = JSON.parse(text) as MainAccount;
    
    // Load FIDE ID from account_fide_ids.json if not in main_account.json
    if (!account.fideId) {
      const fideId = await getAccountFideId(account.name);
      if (fideId) {
        account.fideId = fideId;
      }
    }
    
    return account;
  } catch (error) {
    // File doesn't exist, try localStorage
    const name = localStorage.getItem("mainAccount");
    if (name) {
      const account = { name };
      // Try to load FIDE ID for this account
      const fideId = await getAccountFideId(name);
      if (fideId) {
        account.fideId = fideId;
      }
      return account;
    }
    return null;
  }
}

export async function saveAccountFideId(accountName: string, fideId: string | null): Promise<void> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, FIDE_IDS_FILENAME);
    
    let fideIds: AccountFideIds = {};
    try {
      const text = await readTextFile(file);
      if (text && text.trim() !== "") {
        fideIds = JSON.parse(text) as AccountFideIds;
      }
    } catch {
      // File doesn't exist, start with empty object
    }
    
    if (fideId) {
      fideIds[accountName] = fideId;
      console.log("[MainAccount] Saving FIDE ID", fideId, "for account", accountName);
    } else {
      delete fideIds[accountName];
      console.log("[MainAccount] Removing FIDE ID for account", accountName);
    }
    
    await writeTextFile(file, JSON.stringify(fideIds, null, 2));
    console.log("[MainAccount] FIDE IDs saved:", Object.keys(fideIds));
  } catch (error) {
    console.error("Error saving account FIDE ID:", error);
    throw error;
  }
}

export async function getAccountFideId(accountName: string): Promise<string | null> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, FIDE_IDS_FILENAME);
    const text = await readTextFile(file);
    if (!text || text.trim() === "") {
      console.log("[MainAccount] No FIDE IDs file found for account", accountName);
      return null;
    }
    const fideIds = JSON.parse(text) as AccountFideIds;
    const fideId = fideIds[accountName] || null;
    console.log("[MainAccount] FIDE ID for account", accountName, "is", fideId);
    return fideId;
  } catch (error) {
    console.error("[MainAccount] Error getting FIDE ID for account", accountName, ":", error);
    return null;
  }
}

export async function saveAccountDisplayName(accountName: string, displayName: string | null): Promise<void> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, DISPLAY_NAMES_FILENAME);
    
    let displayNames: AccountDisplayNames = {};
    try {
      const text = await readTextFile(file);
      if (text && text.trim() !== "") {
        displayNames = JSON.parse(text) as AccountDisplayNames;
      }
    } catch {
      // File doesn't exist, start with empty object
    }
    
    if (displayName) {
      displayNames[accountName] = displayName;
    } else {
      delete displayNames[accountName];
    }
    
    await writeTextFile(file, JSON.stringify(displayNames, null, 2));
  } catch (error) {
    console.error("Error saving account display name:", error);
    throw error;
  }
}

export async function getAccountDisplayName(accountName: string): Promise<string | null> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, DISPLAY_NAMES_FILENAME);
    const text = await readTextFile(file);
    if (!text || text.trim() === "") {
      return null;
    }
    const displayNames = JSON.parse(text) as AccountDisplayNames;
    return displayNames[accountName] || null;
  } catch {
    return null;
  }
}

export async function updateMainAccountFideId(fideId: string | null): Promise<void> {
  try {
    const account = await loadMainAccount();
    if (account) {
      // Save FIDE ID for this account
      await saveAccountFideId(account.name, fideId);
      
      // Also update main account if it's the current one
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
