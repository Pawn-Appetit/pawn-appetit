import { style } from "@vanilla-extract/css";

export const pop = style({
    position: "fixed",
    zIndex: 300,
    width: 214,
    background: "var(--mantine-color-body)",
    border: "1px solid var(--mantine-color-default-border)",
    borderRadius: "var(--mantine-radius-md)",
    boxShadow: "var(--mantine-shadow-xl)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    transition: "opacity 0.12s ease",
    fontSize: 14,
});

export const header = style({
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--mantine-color-dimmed)",
    borderBottom: "1px solid var(--mantine-color-default-border)",
});

export const rows = style({
    padding: 5,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
});

export const row = style({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 9px",
    borderRadius: "var(--mantine-radius-sm)",
    background: "transparent",
    border: "1px solid transparent",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    color: "var(--mantine-color-text)",
    font: "inherit",
    selectors: {
        "&:hover": {
            background: "var(--mantine-color-default-hover)",
        },
    },
});

export const selected = style({
    background: "var(--mantine-primary-color-light)",
    borderColor: "var(--mantine-primary-color-filled)",
    selectors: {
        "&:hover": {
            background: "var(--mantine-primary-color-light)",
        },
    },
});

export const idx = style({
    fontSize: 11,
    color: "var(--mantine-color-dimmed)",
    minWidth: 12,
    textAlign: "center",
});

export const san = style({
    fontWeight: 600,
});

export const nag = style({
    fontWeight: 800,
});

export const main = style({
    marginLeft: "auto",
    fontSize: 9,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--mantine-color-dimmed)",
});

export const footer = style({
    padding: "7px 12px",
    fontSize: 11,
    color: "var(--mantine-color-dimmed)",
    borderTop: "1px solid var(--mantine-color-default-border)",
});
