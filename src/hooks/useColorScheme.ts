import { useSyncExternalStore } from "react";

import { Theme } from "@/types";

const query = window.matchMedia("(prefers-color-scheme: dark)");

export function colorScheme(): Theme {
  return query.matches ? Theme.Dark : Theme.Light;
}

function subscribe(onChange: () => void) {
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useColorScheme(): Theme {
  return useSyncExternalStore(subscribe, colorScheme);
}
