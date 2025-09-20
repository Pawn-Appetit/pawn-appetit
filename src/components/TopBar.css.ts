import { style } from "@vanilla-extract/css";

export const icon = style({
  transition: "background-color 100ms ease",
  ":hover": {
    backgroundColor: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-5))",
  },
});
