import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import { getDefaultStore } from "jotai";
import { soundCollectionAtom, soundVolumeAtom } from "@/state/atoms";

let lastTime = 0;

const isLinux = platform() === "linux";
const soundServerPort: Promise<number> = isLinux
  ? invoke<number>("get_sound_server_port")
  : Promise.resolve(0);

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
    let audioSrc: string;

    if (isLinux) {
      const port = await soundServerPort;
      audioSrc = `http://127.0.0.1:${port}/${path}`;
    } else {
      const filePath = await resolveResource(path);
      audioSrc = convertFileSrc(filePath);
    }

    const audio = new Audio();
    audio.volume = volume;
    audio.src = audioSrc;

    await audio.play();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to play sound:', error);
    }
  }
}
