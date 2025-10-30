import { useQuery } from "@tanstack/react-query";
import type { Platform } from "@tauri-apps/plugin-os";
import { z } from "zod";
import { type BestMoves, commands, type EngineOptions, type GoMode } from "@/bindings";
import { isInstallMethodSupported } from "./packageManager";
import { unwrap } from "./unwrap";

export const requiredEngineSettings = ["MultiPV", "Threads", "Hash"];

const ENGINES = [
  {
    name: "Stockfish",
    version: "17.1",
    os: "windows",
    bmi2: true,
    image: "https://upload.wikimedia.org/wikipedia/commons/3/3a/NewLogoSF.png",
    installMethod: "download" as const,
    downloadLink:
      "https://github.com/official-stockfish/Stockfish/releases/latest/download/stockfish-windows-x86-64-avx2.zip",
    path: "stockfish/stockfish-windows-x86-64-avx2.exe",
    elo: 3635,
    downloadSize: 65412642,
  },
  {
    name: "Stockfish",
    version: "17.1",
    os: "windows",
    bmi2: false,
    image: "https://upload.wikimedia.org/wikipedia/commons/3/3a/NewLogoSF.png",
    installMethod: "download" as const,
    downloadLink:
      "https://github.com/official-stockfish/Stockfish/releases/latest/download/stockfish-windows-x86-64-sse41-popcnt.zip",
    path: "stockfish/stockfish-windows-x86-64-sse41-popcnt.exe",
    elo: 3635,
    downloadSize: 65413257,
  },
  {
    name: "Stockfish",
    version: "17.1",
    os: "macos",
    bmi2: true,
    image: "https://upload.wikimedia.org/wikipedia/commons/3/3a/NewLogoSF.png",
    installMethod: "brew" as const,
    brewPackage: "stockfish",
    path: "/opt/homebrew/bin/stockfish",
    elo: 3635,
  },
  {
    name: "Stockfish",
    version: "17.1",
    os: "macos",
    bmi2: false,
    image: "https://upload.wikimedia.org/wikipedia/commons/3/3a/NewLogoSF.png",
    installMethod: "brew" as const,
    brewPackage: "stockfish",
    path: "/opt/homebrew/bin/stockfish",
    elo: 3635,
  },
  {
    name: "Stockfish",
    version: "17.1",
    os: "linux",
    bmi2: true,
    image: "https://upload.wikimedia.org/wikipedia/commons/3/3a/NewLogoSF.png",
    installMethod: "download" as const,
    downloadLink:
      "https://github.com/official-stockfish/Stockfish/releases/latest/download/stockfish-ubuntu-x86-64-avx2.tar",
    path: "stockfish/stockfish-ubuntu-x86-64-avx2",
    elo: 3635,
    downloadSize: 79953920,
  },
  {
    name: "Stockfish",
    version: "17.1",
    os: "linux",
    bmi2: false,
    image: "https://upload.wikimedia.org/wikipedia/commons/3/3a/NewLogoSF.png",
    installMethod: "download" as const,
    downloadLink:
      "https://github.com/official-stockfish/Stockfish/releases/latest/download/stockfish-ubuntu-x86-64-sse41-popcnt.tar",
    path: "stockfish/stockfish-ubuntu-x86-64-sse41-popcnt",
    elo: 3635,
    downloadSize: 79953920,
  },
  {
    name: "RubiChess",
    version: "20240817",
    os: "windows",
    bmi2: true,
    image: "https://images.chesscomfiles.com/chess-themes/computer_chess_championship/avatars/lrg_rubi.png",
    installMethod: "download" as const,
    downloadLink: "https://github.com/Matthies/RubiChess/releases/download/20240817/RubiChess-20240817.zip",
    path: "RubiChess-20240817/windows/RubiChess-20240817_x86-64-avx2.exe",
    elo: 3600,
    downloadSize: 31417660,
  },
  {
    name: "RubiChess",
    version: "20240817",
    os: "windows",
    bmi2: false,
    image: "https://images.chesscomfiles.com/chess-themes/computer_chess_championship/avatars/lrg_rubi.png",
    installMethod: "download" as const,
    downloadLink: "https://github.com/Matthies/RubiChess/releases/download/20240817/RubiChess-20240817.zip",
    path: "RubiChess-20240817/windows/RubiChess-20240817_x86-64-modern.exe",
    elo: 3600,
    downloadSize: 31417660,
  },
  {
    name: "RubiChess",
    version: "20240817",
    os: "linux",
    bmi2: true,
    image: "https://images.chesscomfiles.com/chess-themes/computer_chess_championship/avatars/lrg_rubi.png",
    installMethod: "download" as const,
    downloadLink: "https://github.com/Matthies/RubiChess/releases/download/20240817/RubiChess-20240817.zip",
    path: "RubiChess-20240817/linux/RubiChess-20240817_x86-64-avx2",
    elo: 3600,
    downloadSize: 31417660,
  },
  {
    name: "RubiChess",
    version: "20240817",
    os: "linux",
    bmi2: false,
    image: "https://images.chesscomfiles.com/chess-themes/computer_chess_championship/avatars/lrg_rubi.png",
    installMethod: "download" as const,
    downloadLink: "https://github.com/Matthies/RubiChess/releases/download/20240817/RubiChess-20240817.zip",
    path: "RubiChess-20240817/linux/RubiChess-20240817_x86-64-modern",
    elo: 3600,
    downloadSize: 31417660,
  },
  {
    name: "Dragon by Komodo",
    version: "1",
    os: "windows",
    bmi2: true,
    image: "https://images.chesscomfiles.com/chess-themes/computer_chess_championship/avatars/lrg_dragon.png",
    installMethod: "download" as const,
    downloadLink: "https://komodochess.com/pub/dragon.zip",
    path: "dragon_05e2a7/Windows/dragon-64bit-avx2.exe",
    elo: 3533,
    downloadSize: 85049133,
  },
  {
    name: "Dragon by Komodo",
    version: "1",
    os: "windows",
    bmi2: false,
    image: "https://images.chesscomfiles.com/chess-themes/computer_chess_championship/avatars/lrg_dragon.png",
    installMethod: "download" as const,
    downloadLink: "https://komodochess.com/pub/dragon.zip",
    path: "dragon_05e2a7/Windows/dragon-64bit.exe",
    elo: 3533,
    downloadSize: 85049133,
  },
  {
    name: "Dragon by Komodo",
    version: "1",
    os: "linux",
    bmi2: true,
    image: "https://images.chesscomfiles.com/chess-themes/computer_chess_championship/avatars/lrg_dragon.png",
    installMethod: "download" as const,
    downloadLink: "https://komodochess.com/pub/dragon.zip",
    path: "dragon_05e2a7/Linux/dragon-linux-avx2",
    elo: 3533,
    downloadSize: 85049133,
  },
  {
    name: "Dragon by Komodo",
    version: "1",
    os: "linux",
    bmi2: false,
    image: "https://images.chesscomfiles.com/chess-themes/computer_chess_championship/avatars/lrg_dragon.png",
    installMethod: "download" as const,
    downloadLink: "https://komodochess.com/pub/dragon.zip",
    path: "dragon_05e2a7/Linux/dragon-linux",
    elo: 3533,
    downloadSize: 85049133,
  },
  {
    name: "Dragon by Komodo",
    version: "1",
    os: "macos",
    bmi2: true,
    image: "https://images.chesscomfiles.com/chess-themes/computer_chess_championship/avatars/lrg_dragon.png",
    installMethod: "download" as const,
    downloadLink: "https://komodochess.com/pub/dragon.zip",
    path: "dragon_05e2a7/OSX/dragon-avx2-osx",
    elo: 3533,
    downloadSize: 85049133,
  },
  {
    name: "Dragon by Komodo",
    version: "1",
    os: "macos",
    bmi2: false,
    image: "https://images.chesscomfiles.com/chess-themes/computer_chess_championship/avatars/lrg_dragon.png",
    installMethod: "download" as const,
    downloadLink: "https://komodochess.com/pub/dragon.zip",
    path: "dragon_05e2a7/OSX/dragon-osx",
    elo: 3533,
    downloadSize: 85049133,
  },
  {
    name: "Komodo",
    version: "14",
    os: "windows",
    bmi2: true,
    image: "https://images.chesscomfiles.com/uploads/v1/images_users/tiny_mce/ColinStapczynski/php2OzLMj.jpeg",
    installMethod: "download" as const,
    downloadLink: "https://komodochess.com/pub/komodo-14.zip",
    path: "komodo-14_224afb/Windows/komodo-14.1-64bit-bmi2.exe",
    elo: 3479,
    downloadSize: 9745847,
  },
  {
    name: "Komodo",
    version: "14",
    os: "windows",
    bmi2: false,
    image: "https://images.chesscomfiles.com/uploads/v1/images_users/tiny_mce/ColinStapczynski/php2OzLMj.jpeg",
    installMethod: "download" as const,
    downloadLink: "https://komodochess.com/pub/komodo-14.zip",
    path: "komodo-14_224afb/Windows/komodo-14.1-64bit.exe",
    elo: 3479,
    downloadSize: 9745847,
  },
  {
    name: "Komodo",
    version: "14",
    os: "linux",
    bmi2: true,
    image: "https://images.chesscomfiles.com/uploads/v1/images_users/tiny_mce/ColinStapczynski/php2OzLMj.jpeg",
    installMethod: "download" as const,
    downloadLink: "https://komodochess.com/pub/komodo-14.zip",
    path: "komodo-14_224afb/Linux/komodo-14.1-linux-bmi2",
    elo: 3479,
    downloadSize: 9745847,
  },
  {
    name: "Komodo",
    version: "14",
    os: "linux",
    bmi2: false,
    image: "https://images.chesscomfiles.com/uploads/v1/images_users/tiny_mce/ColinStapczynski/php2OzLMj.jpeg",
    installMethod: "download" as const,
    downloadLink: "https://komodochess.com/pub/komodo-14.zip",
    path: "komodo-14_224afb/Linux/komodo-14.1-linux",
    elo: 3479,
    downloadSize: 9745847,
  },
  {
    name: "Komodo",
    version: "14",
    os: "macos",
    bmi2: true,
    image: "https://images.chesscomfiles.com/uploads/v1/images_users/tiny_mce/ColinStapczynski/php2OzLMj.jpeg",
    installMethod: "download" as const,
    downloadLink: "https://komodochess.com/pub/komodo-14.zip",
    path: "komodo-14_224afb/OSX/komodo-14.1-64-bmi2-osx",
    elo: 3479,
    downloadSize: 9745847,
  },
  {
    name: "Komodo",
    version: "14",
    os: "macos",
    bmi2: false,
    image: "https://images.chesscomfiles.com/uploads/v1/images_users/tiny_mce/ColinStapczynski/php2OzLMj.jpeg",
    installMethod: "download" as const,
    downloadLink: "https://komodochess.com/pub/komodo-14.zip",
    path: "komodo-14_224afb/OSX/komodo-14.1-64-osx",
    elo: 3479,
    downloadSize: 9745847,
  },
  {
    name: "Leela Chess Zero",
    version: "0.30.0",
    os: "windows",
    bmi2: true,
    image: "https://lczero.org/images/logo.svg",
    installMethod: "download" as const,
    downloadLink: "https://pub-561e4f3376ea4e4eb2ffd01a876ba46e.r2.dev/lc0-v0.30.0-windows-gpu-nvidia-cuda.zip",
    path: "lc0-v0.30.0-windows-gpu-nvidia-cuda/lc0.exe",
    elo: 3440,
    downloadSize: 251872888,
  },
  {
    name: "Leela Chess Zero",
    version: "0.30.0",
    os: "macos",
    bmi2: true,
    image: "https://lczero.org/images/logo.svg",
    installMethod: "brew" as const,
    brewPackage: "lc0",
    path: "/opt/homebrew/bin/lc0",
    elo: 3440,
  },
  {
    name: "Leela Chess Zero",
    version: "0.30.0",
    os: "macos",
    bmi2: false,
    image: "https://lczero.org/images/logo.svg",
    installMethod: "brew" as const,
    brewPackage: "lc0",
    path: "/opt/homebrew/bin/lc0",
    elo: 3440,
  },
  {
    name: "Leela Chess Zero",
    version: "0.30.0",
    os: "linux",
    bmi2: true,
    image: "https://lczero.org/images/logo.svg",
    installMethod: "package" as const,
    packageCommand: "sudo apt-get install lc0",
    path: "/usr/bin/lc0",
    elo: 3440,
  },
  {
    name: "Leela Chess Zero",
    version: "0.30.0",
    os: "linux",
    bmi2: false,
    image: "https://lczero.org/images/logo.svg",
    installMethod: "package" as const,
    packageCommand: "sudo apt-get install lc0",
    path: "/usr/bin/lc0",
    elo: 3440,
  },
];

const goModeSchema: z.ZodSchema<GoMode> = z.union([
  z.object({
    t: z.literal("Depth"),
    c: z.number(),
  }),
  z.object({
    t: z.literal("Time"),
    c: z.number(),
  }),
  z.object({
    t: z.literal("Nodes"),
    c: z.number(),
  }),
  z.object({
    t: z.literal("Infinite"),
  }),
]);

const engineSettingsSchema = z.array(
  z.object({
    name: z.string(),
    value: z.string().or(z.number()).or(z.boolean()).nullable(),
  }),
);

export type EngineSettings = z.infer<typeof engineSettingsSchema>;

const localEngineSchema = z.object({
  type: z.literal("local"),
  name: z.string(),
  version: z.string(),
  path: z.string(),
  image: z.string().nullish(),
  elo: z.number().nullish(),
  installMethod: z.enum(["download", "brew", "package"]).nullish(),
  downloadSize: z.number().nullish(),
  downloadLink: z.string().nullish(),
  brewPackage: z.string().nullish(),
  packageCommand: z.string().nullish(),
  loaded: z.boolean().nullish(),
  go: goModeSchema.nullish(),
  enabled: z.boolean().nullish(),
  settings: engineSettingsSchema.nullish(),
});

export type LocalEngine = z.infer<typeof localEngineSchema>;

const remoteEngineSchema = z.object({
  type: z.enum(["chessdb", "lichess"]),
  name: z.string(),
  url: z.string(),
  image: z.string().nullish(),
  loaded: z.boolean().nullish(),
  enabled: z.boolean().nullish(),
  go: goModeSchema.nullish(),
  settings: engineSettingsSchema.nullish(),
});

export type RemoteEngine = z.infer<typeof remoteEngineSchema>;

export const engineSchema = z.union([localEngineSchema, remoteEngineSchema]);
export type Engine = z.infer<typeof engineSchema>;

export function stopEngine(engine: LocalEngine, tab: string): Promise<void> {
  return commands.stopEngine(engine.path, tab).then((r) => {
    unwrap(r);
  });
}

export function killEngine(engine: LocalEngine, tab: string): Promise<void> {
  return commands.killEngine(engine.path, tab).then((r) => {
    unwrap(r);
  });
}

export function getBestMoves(
  engine: LocalEngine,
  tab: string,
  goMode: GoMode,
  options: EngineOptions,
): Promise<[number, BestMoves[]] | null> {
  return commands.getBestMoves(engine.name, engine.path, tab, goMode, options).then((r) => unwrap(r));
}

export function useDefaultEngines(os: Platform | undefined, opened: boolean) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["default-engines", os],
    queryFn: async () => {
      const bmi2: boolean = await commands.isBmi2Compatible();
      const availableEngines = ENGINES.filter((e) => e.os === os && e.bmi2 === bmi2);

      const supportedEngines = await Promise.all(
        availableEngines.map(async (engine) => {
          const isSupported = await isInstallMethodSupported(engine.installMethod || "download");
          return isSupported ? engine : null;
        }),
      );

      return supportedEngines.filter((engine): engine is NonNullable<typeof engine> => engine !== null);
    },
    enabled: opened && !!os,
    staleTime: Infinity,
  });
  return {
    defaultEngines: data,
    error,
    isLoading,
  };
}
