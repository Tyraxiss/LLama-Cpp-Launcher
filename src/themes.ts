export const THEME_OPTIONS = [
  { id: "dark-teal", name: "Obsidian Teal" },
  { id: "dark-blue", name: "Midnight Blue" },
  { id: "dark-violet", name: "Violet Slate" },
  { id: "dark-forest", name: "Forest Amber" },
  { id: "light-teal", name: "Pearl Teal" },
  { id: "light-blue", name: "Glacier Blue" },
  { id: "light-sage", name: "Sage Light" },
  { id: "light-rose", name: "Rose Light" },
] as const;

export type ThemeId = (typeof THEME_OPTIONS)[number]["id"];

export const DEFAULT_THEME: ThemeId = "dark-teal";

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEME_OPTIONS.some((theme) => theme.id === value);
}
