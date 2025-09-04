/**
 * Color utility functions for theme management
 */

export interface HSL {
  h: number;
  s: number;
  l: number;
}

/**
 * Convert hex color to HSL
 */
export function hexToHsl(hex: string): HSL {
  // Remove the hash if present
  hex = hex.replace(/^#/, "");

  // Parse the hex values
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / diff + 2) / 6;
        break;
      case b:
        h = ((r - g) / diff + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Convert HSL to hex color
 */
export function hslToHex(h: number, s: number, l: number): string {
  h = h / 360;
  s = s / 100;
  l = l / 100;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (c: number) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Generate a complete color shade palette from a base color
 */
export function generateColorShades(baseColor: string): string[] {
  const hsl = hexToHsl(baseColor);

  // Define lightness values for each shade (0-9)
  const lightnessValues = [95, 85, 75, 65, 55, 45, 35, 25, 15, 8];

  return lightnessValues.map((lightness) => {
    // Adjust saturation based on lightness for better visual harmony
    let adjustedSaturation = hsl.s;

    if (lightness > 80) {
      // Reduce saturation for very light colors
      adjustedSaturation = Math.max(hsl.s * 0.3, 10);
    } else if (lightness < 20) {
      // Slightly reduce saturation for very dark colors
      adjustedSaturation = Math.max(hsl.s * 0.8, 20);
    }

    return hslToHex(hsl.h, adjustedSaturation, lightness);
  });
}

/**
 * Calculate the relative luminance of a color
 */
export function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const { r, g, b } = rgb;
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Convert hex to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Calculate contrast ratio between two colors
 */
export function getContrastRatio(color1: string, color2: string): number {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if a color combination meets WCAG accessibility standards
 */
export function isAccessible(backgroundColor: string, textColor: string, level: "AA" | "AAA" = "AA"): boolean {
  const contrast = getContrastRatio(backgroundColor, textColor);
  const threshold = level === "AAA" ? 7 : 4.5;
  return contrast >= threshold;
}

/**
 * Generate accessible text color for a given background
 */
export function getAccessibleTextColor(backgroundColor: string, lightColor = "#ffffff", darkColor = "#000000"): string {
  const lightContrast = getContrastRatio(backgroundColor, lightColor);
  const darkContrast = getContrastRatio(backgroundColor, darkColor);

  return lightContrast > darkContrast ? lightColor : darkColor;
}

/**
 * Darken a color by a percentage
 */
export function darken(hex: string, percent: number): string {
  const hsl = hexToHsl(hex);
  const newLightness = Math.max(0, hsl.l - percent);
  return hslToHex(hsl.h, hsl.s, newLightness);
}

/**
 * Lighten a color by a percentage
 */
export function lighten(hex: string, percent: number): string {
  const hsl = hexToHsl(hex);
  const newLightness = Math.min(100, hsl.l + percent);
  return hslToHex(hsl.h, hsl.s, newLightness);
}

/**
 * Create a harmonious color palette based on color theory
 */
export function generateHarmoniousColors(baseColor: string): {
  complementary: string;
  triadic: [string, string];
  analogous: [string, string];
  splitComplementary: [string, string];
} {
  const hsl = hexToHsl(baseColor);

  return {
    complementary: hslToHex((hsl.h + 180) % 360, hsl.s, hsl.l),
    triadic: [hslToHex((hsl.h + 120) % 360, hsl.s, hsl.l), hslToHex((hsl.h + 240) % 360, hsl.s, hsl.l)],
    analogous: [hslToHex((hsl.h + 30) % 360, hsl.s, hsl.l), hslToHex((hsl.h - 30 + 360) % 360, hsl.s, hsl.l)],
    splitComplementary: [hslToHex((hsl.h + 150) % 360, hsl.s, hsl.l), hslToHex((hsl.h + 210) % 360, hsl.s, hsl.l)],
  };
}
