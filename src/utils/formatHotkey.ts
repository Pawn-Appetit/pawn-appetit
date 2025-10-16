// Simple hotkey formatting for display only. Keeps parsers using raw tokens.

const isMac: boolean = navigator.platform.toLowerCase().includes("mac");

function mapTokenForDisplay(token: string, mac: boolean): string {
  const key = token.trim().toLowerCase();
  if (!key) return "";

  // Platform-specific modifiers
  const modifiers: Record<string, string> = {
    mod: mac ? "⌘" : "Ctrl",
    ctrl: mac ? "⌃" : "Ctrl",
    control: mac ? "⌃" : "Ctrl",
    alt: mac ? "⌥" : "Alt",
    option: mac ? "⌥" : "Alt",
    shift: mac ? "⇧" : "Shift",
  };

  if (key in modifiers) return modifiers[key];

  // Standard key mappings
  const keyMap: Record<string, string> = {
    arrowleft: "←",
    left: "←",
    arrowright: "→",
    right: "→",
    arrowup: "↑",
    up: "↑",
    arrowdown: "↓",
    down: "↓",
    pageup: "PageUp",
    pagedown: "PageDown",
    tab: "Tab",
    enter: "Enter",
    return: "Enter",
    escape: "Escape",
    esc: "Escape",
    delete: "Delete",
    del: "Delete",
    backspace: "Backspace",
    space: "Space",
    spacebar: "Space",
  };

  if (key in keyMap) return keyMap[key];

  // Function keys
  const fMatch = /^f(\d{1,2})$/.exec(key);
  if (fMatch) return `F${fMatch[1]}`;

  // Single letter -> uppercase
  if (/^[a-z]$/.test(key)) return key.toUpperCase();

  return key.length > 1 ? key[0].toUpperCase() + key.slice(1) : key;
}

export function formatHotkeyDisplay(combo: string): string {
  return combo
    .split("+")
    .map((t) => mapTokenForDisplay(t, isMac))
    .join("+");
}

export function splitHotkeyDisplay(combo: string): string[] {
  return formatHotkeyDisplay(combo).split("+");
}

export default formatHotkeyDisplay;
