import { compressToUTF16, decompressFromUTF16 } from "lz-string";
import type { StateStorage } from "zustand/middleware";

// Tab/tree state is persisted to sessionStorage, which has a ~5MB quota (UTF-16, ~2 bytes/char).
// Large opening repertoires serialize to well over 1MB of JSON, so a few open tabs overflow the
// quota and `setItem` throws. Compress on write (~5x on repetitive chess data) to stay under the
// quota, and decode on read while tolerating any legacy, uncompressed value already in storage.

export function serializeStorageValue(value: unknown): string {
    return compressToUTF16(JSON.stringify(value));
}

export function deserializeStorageValue<T>(raw: string): T | null {
    try {
        const decompressed = decompressFromUTF16(raw);
        if (decompressed) {
            return JSON.parse(decompressed) as T;
        }
    } catch {
        // Not our compressed format — fall through to legacy plain JSON.
    }
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

// Drop-in StateStorage for zustand `persist`: compresses the JSON string into sessionStorage and
// decompresses on the way out, tolerating any legacy uncompressed value already stored.
export const compressedSessionStorage: StateStorage = {
    getItem: (name) => {
        const raw = sessionStorage.getItem(name);
        if (raw == null) return null;
        try {
            const decompressed = decompressFromUTF16(raw);
            // Validate that decompression produced parseable JSON before trusting it.
            if (decompressed) {
                JSON.parse(decompressed);
                return decompressed;
            }
        } catch {
            // Not a valid compressed value — fall through to return the raw string (legacy).
        }
        return raw;
    },
    setItem: (name, value) => {
        sessionStorage.setItem(name, compressToUTF16(value));
    },
    removeItem: (name) => {
        sessionStorage.removeItem(name);
    },
};
