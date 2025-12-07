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

const FILENAME = "fide_profile.json";

export async function saveFideProfile(profile: FideProfile): Promise<void> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, FILENAME);
    const profileWithTimestamp = {
      ...profile,
      updatedAt: new Date().toISOString(),
    };
    await writeTextFile(file, JSON.stringify(profileWithTimestamp, null, 2));
  } catch (error) {
    console.error("Error saving FIDE profile:", error);
    throw error;
  }
}

export async function loadFideProfile(): Promise<FideProfile | null> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, FILENAME);
    const text = await readTextFile(file);
    if (!text || text.trim() === "") {
      return null;
    }
    return JSON.parse(text) as FideProfile;
  } catch (error) {
    // File doesn't exist or is invalid, return null
    return null;
  }
}

export async function deleteFideProfile(): Promise<void> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, FILENAME);
    await writeTextFile(file, "");
  } catch (error) {
    console.error("Error deleting FIDE profile:", error);
  }
}
