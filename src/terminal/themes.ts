import type { ITheme } from "@xterm/xterm";

import { Theme } from "@/types";

const ANSI = {
  black: "#000000",
  red: "#bb0000",
  green: "#00bb00",
  yellow: "#bbbb00",
  blue: "#0000bb",
  magenta: "#bb00bb",
  cyan: "#00bbbb",
  white: "#bbbbbb",
  brightBlack: "#555555",
  brightRed: "#ff5555",
  brightGreen: "#55ff55",
  brightYellow: "#ffff55",
  brightBlue: "#5555ff",
  brightMagenta: "#ff55ff",
  brightCyan: "#55ffff",
  brightWhite: "#ffffff",
} as const;

const SHARED = {
  ...ANSI,
  cursorAccent: "#ffffff",
  selectionBackground: "#b5d5ff",
  selectionForeground: "#000000",
} as const;

export const TERMINAL_THEMES: Record<Theme, ITheme> = {
  [Theme.Dark]: { ...SHARED, foreground: "#bbbbbb", background: "#000000", cursor: "#bbbbbb" },
  [Theme.Light]: { ...SHARED, foreground: "#000000", background: "#ffffff", cursor: "#000000" },
};
