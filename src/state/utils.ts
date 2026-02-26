import { BaseDirectory, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import type {
  AsyncStorage,
  AsyncStringStorage,
  SyncStorage,
  SyncStringStorage,
} from "jotai/vanilla/utils/atomWithStorage";
import { z } from "zod";
import { logger } from "@/utils/logger";

/**
 * Creates a Zod array schema that silently filters out items that fail
 * validation, so a single corrupt entry won't break the whole list.
 */
export const zodArray = <S>(itemSchema: z.ZodType<S>): z.ZodType<S[]> => {
  const catchValue = {} as never;
  return z
    .array(itemSchema.catch(catchValue))
    .transform((a) => a.filter((o) => o !== catchValue))
    .catch([]) as z.ZodType<S[]>;
};

const options = { baseDir: BaseDirectory.AppData };
export const fileStorage: AsyncStringStorage = {
  async getItem(key) {
    try {
      return await readTextFile(key, options);
    } catch (error) {
      logger.error("Error getting item", { key, error });
      return null;
    }
  },
  async setItem(key, newValue) {
    await writeTextFile(key, newValue, options);
  },
  async removeItem(key) {
    await remove(key, options);
  },
};

export function createZodStorage<Value>(schema: z.ZodType<Value>, storage: SyncStringStorage): SyncStorage<Value> {
  return {
    getItem(key, initialValue) {
      const storedValue = storage.getItem(key);
      if (storedValue === null) {
        return initialValue;
      }
      try {
        return schema.parse(JSON.parse(storedValue));
      } catch {
        logger.warn("Invalid value for", { key, storedValue });
        this.setItem(key, initialValue);
        return initialValue;
      }
    },
    setItem(key, value) {
      storage.setItem(key, JSON.stringify(value));
    },
    removeItem(key) {
      storage.removeItem(key);
    },
  };
}

export function createAsyncZodStorage<Value>(
  schema: z.ZodType<Value>,
  storage: AsyncStringStorage,
): AsyncStorage<Value> {
  return {
    async getItem(key, initialValue) {
      try {
        const storedValue = await storage.getItem(key);
        if (storedValue === null) {
          return initialValue;
        }
        const res = schema.safeParse(JSON.parse(storedValue));
        if (res.success) {
          return res.data;
        }
        logger.warn("Invalid value for", { key, storedValue, error: res.error });
        await this.setItem(key, initialValue);
        return initialValue;
      } catch (error) {
        logger.error("Error getting", { key, error });
        return initialValue;
      }
    },
    async setItem(key, value) {
      storage.setItem(key, JSON.stringify(value, null, 4));
    },
    async removeItem(key) {
      storage.removeItem(key);
    },
  };
}
