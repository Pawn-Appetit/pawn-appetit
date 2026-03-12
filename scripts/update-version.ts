// @ts-nocheck
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

/**
 * Update project version across:
 * - package.json → root.version
 * - src-tauri/Cargo.toml → [package] version
 * - src-tauri/tauri.conf.json → root.version
 */
export async function updateVersion(newVersion: string) {
    assertSemver(newVersion);

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const root = path.resolve(__dirname, "..");

    const pkgPath = path.join(root, "package.json");
    const cargoPath = path.join(root, "src-tauri", "Cargo.toml");
    const tauriConfPath = path.join(root, "src-tauri", "tauri.conf.json");

    // package.json
    const pkgRaw = await readFile(pkgPath, "utf8");
    const pkg = JSON.parse(pkgRaw);
    const prevPkgVersion = pkg.version;
    pkg.version = newVersion;
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

    // src-tauri/Cargo.toml → only within [package] section
    const cargoRaw = await readFile(cargoPath, "utf8");
    const updatedCargo = replaceCargoTomlVersion(cargoRaw, newVersion);
    await writeFile(cargoPath, updatedCargo, "utf8");

    // src-tauri/tauri.conf.json
    const tauriRaw = await readFile(tauriConfPath, "utf8");
    const tauriJson = JSON.parse(tauriRaw);
    const prevTauriVersion = tauriJson.version;
    tauriJson.version = newVersion;
    await writeFile(tauriConfPath, JSON.stringify(tauriJson, null, 2) + "\n", "utf8");

    return {
        packageJson: { path: pkgPath, from: prevPkgVersion, to: newVersion },
        cargoToml: { path: cargoPath },
        tauriConf: { path: tauriConfPath, from: prevTauriVersion, to: newVersion },
    };
}

function assertSemver(v: string) {
    // Basic semver: major.minor.patch with optional pre-release/build
    const semverRe = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
    if (!semverRe.test(v)) {
        throw new Error(`Invalid version: ${v}. Expected semver like 1.2.3 or 1.2.3-rc.1`);
    }
}

function replaceCargoTomlVersion(content: string, newVersion: string): string {
    // Scope replacement to the [package] section only
    const sectionRe = /\[package\]([\s\S]*?)(?=\n\[|$)/;
    const match = content.match(sectionRe);
    if (!match) {
        throw new Error("Could not locate [package] section in Cargo.toml");
    }

    const sectionBody = match[1];
    // Remove any existing version lines in the [package] section (defensive)
    const lines = sectionBody.split(/\r?\n/);
    const filtered = lines.filter((l) => !/^\s*version\s*=\s*"[^"]*"\s*$/.test(l));
    // Drop leading empty line to avoid `[package]\n\n...`
    if (filtered.length && filtered[0].trim() === "") filtered.shift();
    const finalSection =
        `\n${filtered?.[0]}\nversion = "${newVersion}"` + `\n${filtered.slice(1).join("\n")}`;

    // Always ensure a newline after [package]
    return content.replace(sectionRe, `[package]${finalSection}`);
}

// Detect if this module is the entrypoint in Node ESM
const isMain = (() => {
    try {
        // @ts-ignore - process is provided by Node at runtime
        const argv = typeof process !== "undefined" ? process.argv : undefined;
        if (!argv || argv.length < 2) return false;
        const thisUrl = import.meta.url;
        const entryUrl = pathToFileURL(argv[1]).href;
        return thisUrl === entryUrl;
    } catch {
        return false;
    }
})();

if (isMain) {
    // @ts-ignore - process is provided by Node at runtime
    const [, , arg] = process.argv;
    if (!arg) {
        console.error("Usage: tsx scripts/update-version.ts <new-version>");
        // @ts-ignore - process is provided by Node at runtime
        process.exit(1);
    }
    updateVersion(arg)
        .then((res) => {
            console.log("Version updated:", res);
        })
        .catch((err) => {
            console.error(err);
            // @ts-ignore - process is provided by Node at runtime
            process.exit(1);
        });
}
