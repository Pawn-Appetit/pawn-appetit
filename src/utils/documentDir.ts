import { homeDir, resolve, documentDir as tauriDocumentDir } from "@tauri-apps/api/path";
import { error, info } from "@tauri-apps/plugin-log";
import { getDefaultStore } from "jotai";
import { storedDocumentDirAtom } from "@/state/atoms";

const APP_FOLDER_NAME = "Pawn Appetit";

export async function getDocumentDir(): Promise<string> {
  try {
    const store = getDefaultStore();
    let docDir = store.get(storedDocumentDirAtom);

    if (!docDir) {
      docDir = await resolve(await tauriDocumentDir(), APP_FOLDER_NAME);
    }

    info(`Using documents directory: ${docDir}`);
    return docDir;
  } catch (e) {
    error(`Failed to access documents directory: ${e}`);
    try {
      const homeDirPath = await resolve(await homeDir(), APP_FOLDER_NAME);
      info(`Fallback to home directory: ${homeDirPath}`);
      return homeDirPath;
    } catch (homeError) {
      error(`Failed to access home directory: ${homeError}`);
      throw new Error(`Cannot access any suitable directory: ${e}, ${homeError}`);
    }
  }
}
