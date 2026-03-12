type TimeControlCategory =
    | "ultra_bullet"
    | "bullet"
    | "blitz"
    | "rapid"
    | "classical"
    | "daily"
    | "correspondence";

export function getTimeControl(website: string, timeControl: string): TimeControlCategory {
    if (website === "Chess.com" && timeControl.startsWith("1/")) {
        return "daily";
    }

    if (website === "Lichess" && timeControl === "-") {
        return "correspondence";
    }

    const [initial, increment = 0] = timeControl.split("+").map(Number);
    const total = initial + increment * 40;

    if (website === "Chess.com") {
        if (total < 180) return "bullet";
        if (total <= 500) return "blitz";
        return "rapid";
    }

    // Lichess time controls
    if (total < 30) return "ultra_bullet";
    if (total < 180) return "bullet";
    if (total < 480) return "blitz";
    if (total < 1500) return "rapid";
    return "classical";
}
