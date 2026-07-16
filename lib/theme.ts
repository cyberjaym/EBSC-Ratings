// Defaults mirror the original single-tenant app's dark theme (index.html),
// so an un-themed tenant looks identical to the legacy PWA. Anything a
// league admin hasn't set falls back to these.
export const DEFAULT_THEME = {
  accentColor: "#34d399",
  backgroundColor: "#0b1120",
  logoUrl: null as string | null,
  backgroundImageUrl: null as string | null,
};

export type TenantTheme = typeof DEFAULT_THEME;

export function resolveTheme(raw: unknown): TenantTheme {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<TenantTheme>;
  return {
    accentColor: typeof t.accentColor === "string" ? t.accentColor : DEFAULT_THEME.accentColor,
    backgroundColor: typeof t.backgroundColor === "string" ? t.backgroundColor : DEFAULT_THEME.backgroundColor,
    logoUrl: typeof t.logoUrl === "string" ? t.logoUrl : null,
    backgroundImageUrl: typeof t.backgroundImageUrl === "string" ? t.backgroundImageUrl : null,
  };
}
