import { style } from "@vanilla-extract/css";
import { vars } from "@/styles/theme";

export const row = style({
  padding: "8px 12px",
  cursor: "pointer",
  borderRadius: "6px",
  margin: "2px 4px",
  transition: "all 0.15s ease-in-out",
  [vars.lightSelector]: {
    borderLeft: `3px solid transparent`,
    "&:hover": {
      backgroundColor: vars.colors.gray[1],
      borderLeftColor: vars.colors.blue[6],
      transform: "translateX(2px)",
    },
  },
  [vars.darkSelector]: {
    borderLeft: `3px solid transparent`,
    "&:hover": {
      backgroundColor: vars.colors.dark[5],
      borderLeftColor: vars.colors.blue[6],
      transform: "translateX(2px)",
    },
  },
});

export const active = style({
  fontWeight: 600,
  [vars.lightSelector]: {
    backgroundColor: vars.colors.blue[0],
    borderLeftColor: vars.colors.blue[6],
    color: vars.colors.blue[9],
  },
  [vars.darkSelector]: {
    backgroundColor: vars.colors.dark[4],
    borderLeftColor: vars.colors.blue[5],
    color: vars.colors.blue[3],
  },
  ":hover": {
    [vars.lightSelector]: {
      backgroundColor: vars.colors.blue[1],
      borderLeftColor: vars.colors.blue[7],
    },
    [vars.darkSelector]: {
      backgroundColor: vars.colors.dark[3],
      borderLeftColor: vars.colors.blue[4],
    },
  },
});
