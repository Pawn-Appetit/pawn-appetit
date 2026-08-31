import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import { getDefaultStore } from "jotai";
import { commands } from "@/bindings";
import { soundCollectionAtom, soundVolumeAtom } from "@/state/atoms";

function isLinux(): boolean {
    try {
        return platform() === "linux";
    } catch {
        return false;
    }
}

const soundFormats = [
    { extension: "ogg", mimeType: 'audio/ogg; codecs="vorbis"' },
    { extension: "mp3", mimeType: "audio/mpeg" },
] as const;

let preferredSoundExtension: (typeof soundFormats)[number]["extension"] | undefined;
let lastTime = 0;

const soundServerPort: Promise<number> = isLinux()
    ? commands.getSoundServerPort()
    : Promise.resolve(0);

function getPreferredSoundExtension(): (typeof soundFormats)[number]["extension"] {
    if (preferredSoundExtension) {
        return preferredSoundExtension;
    }

    if (typeof Audio === "undefined") {
        preferredSoundExtension = "mp3";
        return preferredSoundExtension;
    }

    const audio = new Audio();
    preferredSoundExtension =
        soundFormats.find((format) => audio.canPlayType(format.mimeType) !== "")?.extension ??
        "mp3";
    return preferredSoundExtension;
}

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

    const path = `sound/${collection}/${type}.${getPreferredSoundExtension()}`;

    try {
        let audioSrc: string;

        if (isLinux()) {
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
            console.error("Failed to play sound:", error);
        }
    }
}
