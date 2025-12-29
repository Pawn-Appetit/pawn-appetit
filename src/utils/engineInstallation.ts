import { commands } from "@/bindings";
import type { LocalEngine } from "./engines";
import { unwrap } from "./unwrap";

export async function checkEngineInstalled(
  engine: Pick<LocalEngine, "installMethod" | "path" | "brewPackage" | "packageCommand">,
): Promise<boolean> {
  try {
    const fileExists = unwrap(await commands.fileExists(engine.path));
    if (fileExists) {
      return true;
    }

    if (engine.installMethod === "brew" && engine.brewPackage) {
      return unwrap(await commands.checkPackageInstalled("brew", engine.brewPackage));
    }

    if (engine.installMethod === "package" && engine.packageCommand) {
      const [manager, ...args] = engine.packageCommand.split(" ");
      const packageName = args[args.length - 1];
      const cleanManager = manager.replace("sudo", "").trim();
      return unwrap(await commands.checkPackageInstalled(cleanManager, packageName));
    }

    return false;
  } catch {
    return false;
  }
}

export async function findEngineExecutablePath(
  engine: Pick<LocalEngine, "installMethod" | "path" | "name">,
): Promise<string | null> {
  try {
    const fileExists = unwrap(await commands.fileExists(engine.path));
    if (fileExists) {
      return engine.path;
    }

    if (engine.installMethod === "brew" || engine.installMethod === "package") {
      const possibleNames = [
        engine.name.toLowerCase(),
        engine.name.toLowerCase().replace(/\s+/g, ""),
        engine.name.toLowerCase().replace(/\s+/g, "-"),
      ];

      for (const name of possibleNames) {
        const foundPath = unwrap(await commands.findExecutablePath(name));
        if (foundPath) {
          return foundPath;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
