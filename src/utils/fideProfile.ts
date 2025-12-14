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

const FILENAME = "fide_profile.json"; // Legacy single profile file
const PROFILES_FILENAME = "fide_profiles.json"; // New multiple profiles file

// Legacy function for backward compatibility - loads single profile
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

// New function to load profile by FIDE ID
export async function loadFideProfileById(fideId: string): Promise<FideProfile | null> {
  try {
    const dir = await appDataDir();
    const file = await resolve(dir, PROFILES_FILENAME);
    const text = await readTextFile(file);
    if (!text || text.trim() === "") {
      console.log("[FideProfile] Profiles file is empty, trying legacy file");
      // Fallback to legacy file if new file doesn't exist
      const legacyProfile = await loadFideProfile();
      if (legacyProfile && legacyProfile.fideId === fideId) {
        console.log("[FideProfile] Found profile in legacy file");
        return legacyProfile;
      }
      console.log("[FideProfile] No profile found in legacy file for FIDE ID:", fideId);
      return null;
    }
    const profiles = JSON.parse(text) as FideProfiles;
    const profile = profiles[fideId] || null;
    console.log("[FideProfile] Loading profile for FIDE ID:", fideId, profile ? "found" : "not found");
    if (profile) {
      console.log("[FideProfile] Profile data:", {
        name: profile.name,
        title: profile.title,
        standardRating: profile.standardRating,
        photo: profile.photo ? "present" : "missing"
      });
    }
    return profile;
  } catch (error) {
    console.error("[FideProfile] Error loading profile by ID:", error);
    // File doesn't exist or is invalid, try legacy file
    const legacyProfile = await loadFideProfile();
    if (legacyProfile && legacyProfile.fideId === fideId) {
      console.log("[FideProfile] Found profile in legacy file after error");
      return legacyProfile;
    }
    return null;
  }
}

export async function saveFideProfile(profile: FideProfile): Promise<void> {
  try {
    const dir = await appDataDir();
    
    // Save to new multiple profiles file
    const profilesFile = await resolve(dir, PROFILES_FILENAME);
    let profiles: FideProfiles = {};
    try {
      const text = await readTextFile(profilesFile);
      if (text && text.trim() !== "") {
        profiles = JSON.parse(text) as FideProfiles;
      }
    } catch {
      // File doesn't exist, start with empty object
    }
    
    const profileWithTimestamp = {
      ...profile,
      updatedAt: new Date().toISOString(),
    };
    
    profiles[profile.fideId] = profileWithTimestamp;
    console.log("[FideProfile] Saving profile for FIDE ID:", profile.fideId, "to", PROFILES_FILENAME);
    await writeTextFile(profilesFile, JSON.stringify(profiles, null, 2));
    console.log("[FideProfile] Profile saved successfully");
    
    // Also save to legacy file for backward compatibility
    const legacyFile = await resolve(dir, FILENAME);
    await writeTextFile(legacyFile, JSON.stringify(profileWithTimestamp, null, 2));
  } catch (error) {
    console.error("Error saving FIDE profile:", error);
    throw error;
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
      // File doesn't exist, nothing to delete
      return;
    }
    
    delete profiles[fideId];
    await writeTextFile(profilesFile, JSON.stringify(profiles, null, 2));
  } catch (error) {
    console.error("Error deleting FIDE profile by ID:", error);
  }
}
