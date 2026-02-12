import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import { getDefaultStore } from "jotai";
import { soundCollectionAtom, soundVolumeAtom } from "@/state/atoms";

let lastTime = 0;

export async function playSound(capture: boolean, check: boolean) {
  const now = Date.now();
  if (now - lastTime < 75) {
    return;
  }
  lastTime = now;

  const store = getDefaultStore();
  const collection = store.get(soundCollectionAtom);
  const volume = store.get(soundVolumeAtom);

  let type = "Move";
  if (capture) {
    type = "Capture";
  }
  if (collection !== "standard" && check) {
    type = "Check";
  }

  const path = `sound/${collection}/${type}.mp3`;

  try {
    const filePath = await resolveResource(path);
    const assetUrl = convertFileSrc(filePath);
    
    const audio = new Audio();
    audio.volume = volume;
    audio.src = assetUrl;
    
    await audio.play();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to play sound:', error);
    }
  }
}