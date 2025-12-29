import { appDataDir, resolve } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

export interface FideProfile {
  fideId: string;
  name: string;
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  title?: string;
  standardRating?: number;
  rapidRating?: number;
  blitzRating?: number;
  worldRank?: number;
  nationalRank?: number;
  federation?: string;
  photo?: string; // URL of the profile photo
  birthYear?: number;
  age?: number;
  updatedAt?: string;
}

export interface FideProfiles {
  [fideId: string]: FideProfile; // Maps FIDE ID to profile
}

const FILENAME = "fide_profile.json";
const PROFILES_FILENAME = "fide_profiles.json";

export async function loadFideProfile(): Promise<FideProfile | null> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, FILENAME);
    const text = await readTextFile(file);
    if (!text || text.trim() === "") {
      return null;
    }
    return JSON.parse(text) as FideProfile;
  } catch {
    return null;
  }
}

export async function loadFideProfileById(fideId: string): Promise<FideProfile | null> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, PROFILES_FILENAME);
    const text = await readTextFile(file);
    if (!text || text.trim() === "") {
      const legacyProfile = await loadFideProfile();
      if (legacyProfile && legacyProfile.fideId === fideId) {
        return legacyProfile;
      }
      return null;
    }
    const profiles = JSON.parse(text) as FideProfiles;
    return profiles[fideId] || null;
  } catch {
    const legacyProfile = await loadFideProfile();
    if (legacyProfile && legacyProfile.fideId === fideId) {
      return legacyProfile;
    }
    return null;
  }
}

export async function saveFideProfile(profile: FideProfile): Promise<void> {
  const dir = await appDataDir();

  const profilesFile = await resolve(dir, PROFILES_FILENAME);
  let profiles: FideProfiles = {};
  try {
    const text = await readTextFile(profilesFile);
    if (text && text.trim() !== "") {
      profiles = JSON.parse(text) as FideProfiles;
    }
  } catch {}

  const profileWithTimestamp = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };

  profiles[profile.fideId] = profileWithTimestamp;
  await writeTextFile(profilesFile, JSON.stringify(profiles, null, 2));

  const legacyFile = await resolve(dir, FILENAME);
  await writeTextFile(legacyFile, JSON.stringify(profileWithTimestamp, null, 2));
}

export async function deleteFideProfile(): Promise<void> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, FILENAME);
    await writeTextFile(file, "");
  } catch {}
}

export async function deleteFideProfileById(fideId: string): Promise<void> {
  try {
    const dir = await appDataDir();
    const profilesFile = await resolve(dir, PROFILES_FILENAME);

    let profiles: FideProfiles = {};
    try {
      const text = await readTextFile(profilesFile);
      if (text && text.trim() !== "") {
        profiles = JSON.parse(text) as FideProfiles;
      }
    } catch {
      return;
    }

    delete profiles[fideId];
    await writeTextFile(profilesFile, JSON.stringify(profiles, null, 2));
  } catch {}
}
