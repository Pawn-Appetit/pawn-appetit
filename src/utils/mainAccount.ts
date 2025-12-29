import { appDataDir, resolve } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

export interface MainAccount {
  name: string;
  fideId?: string;
  displayName?: string;
  lichessToken?: string;
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
  const dir = await appDataDir();
  const file = await resolve(dir, FILENAME);
  const accountWithTimestamp = {
    ...account,
    updatedAt: new Date().toISOString(),
  };
  await writeTextFile(file, JSON.stringify(accountWithTimestamp, null, 2));
  localStorage.setItem("mainAccount", account.name);
  window.dispatchEvent(new CustomEvent("mainAccountChanged", { detail: account }));
}

export async function loadMainAccount(): Promise<MainAccount | null> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, FILENAME);
    const text = await readTextFile(file);
    if (!text || text.trim() === "") {
      const name = localStorage.getItem("mainAccount");
      if (name) {
        return { name };
      }
      return null;
    }
    const account = JSON.parse(text) as MainAccount;

    if (!account.fideId) {
      const fideId = await getAccountFideId(account.name);
      if (fideId) {
        account.fideId = fideId;
      }
    }

    return account;
  } catch {
    const name = localStorage.getItem("mainAccount");
    if (name) {
      const account: MainAccount = { name };
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
  const dir = await appDataDir();
  const file = await resolve(dir, FIDE_IDS_FILENAME);

  let fideIds: AccountFideIds = {};
  try {
    const text = await readTextFile(file);
    if (text && text.trim() !== "") {
      fideIds = JSON.parse(text) as AccountFideIds;
    }
  } catch {}

  if (fideId) {
    fideIds[accountName] = fideId;
  } else {
    delete fideIds[accountName];
  }

  await writeTextFile(file, JSON.stringify(fideIds, null, 2));
}

export async function getAccountFideId(accountName: string): Promise<string | null> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, FIDE_IDS_FILENAME);
    const text = await readTextFile(file);
    if (!text || text.trim() === "") {
      return null;
    }
    const fideIds = JSON.parse(text) as AccountFideIds;
    return fideIds[accountName] || null;
  } catch {
    return null;
  }
}

export async function saveAccountDisplayName(accountName: string, displayName: string | null): Promise<void> {
  const dir = await appDataDir();
  const file = await resolve(dir, DISPLAY_NAMES_FILENAME);

  let displayNames: AccountDisplayNames = {};
  try {
    const text = await readTextFile(file);
    if (text && text.trim() !== "") {
      displayNames = JSON.parse(text) as AccountDisplayNames;
    }
  } catch {}

  if (displayName) {
    displayNames[accountName] = displayName;
  } else {
    delete displayNames[accountName];
  }

  await writeTextFile(file, JSON.stringify(displayNames, null, 2));
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
  const account = await loadMainAccount();
  if (!account) return;

  await saveAccountFideId(account.name, fideId);

  if (fideId) {
    account.fideId = fideId;
  } else {
    delete account.fideId;
  }

  await saveMainAccount(account);
}
