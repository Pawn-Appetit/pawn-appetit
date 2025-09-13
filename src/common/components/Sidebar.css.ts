import { style } from "@vanilla-extract/css";
import { vars } from "@/styles/theme";

export const link = style({
  width: "3rem",
  height: "3rem",
  display: "flex",
  alignItems: "center",
  "@media": {
    [`(width >= ${vars.breakpoints.sm})`]: {
      borderLeft: "3px solid transparent",
      borderRight: "3px solid transparent",
    },
    [`(width < ${vars.breakpoints.sm})`]: {
      borderTop: "3px solid transparent",
    },
  },
  justifyContent: "center",
  [vars.lightSelector]: {
    color: vars.colors.gray[7],
  },
  [vars.darkSelector]: {
    color: vars.colors.dark[0],
  },

  ":hover": {
    [vars.lightSelector]: {
      color: vars.colors.dark[5],
    },
    [vars.darkSelector]: {
      color: vars.colors.gray[0],
    },
  },
});

export const active = style({
  [vars.lightSelector]: {
    color: vars.colors.dark[5],
  },
  [vars.darkSelector]: {
    color: vars.colors.white,
  },

  "@media": {
    [`(width >= ${vars.breakpoints.sm})`]: {
      borderLeftColor: vars.colors.primary,
    },
    [`(width < ${vars.breakpoints.sm})`]: {
      borderTopColor: vars.colors.primary,
    },
  },
});
