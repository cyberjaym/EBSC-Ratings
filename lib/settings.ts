// Generic per-tenant config the core app reads rather than hardcodes.
// policyDoc/scheduleDefaults have no reader yet — they're prep for the
// Parent Comms Copilot and Schedule Maker feature modules — but the
// storage and editing UI exist now so a league admin can start filling
// them in before those features ship.
export const DEFAULT_SETTINGS = {
  policyDoc: "",
  scheduleDefaults: {
    gamesPerWeek: 1,
    gameLengthMinutes: 60,
    restDaysBetweenGames: 2,
  },
};

export type TenantSettings = typeof DEFAULT_SETTINGS;

export function resolveSettings(raw: unknown): TenantSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<TenantSettings>;
  const sd = (s.scheduleDefaults && typeof s.scheduleDefaults === "object" ? s.scheduleDefaults : {}) as Partial<
    TenantSettings["scheduleDefaults"]
  >;
  return {
    policyDoc: typeof s.policyDoc === "string" ? s.policyDoc : DEFAULT_SETTINGS.policyDoc,
    scheduleDefaults: {
      gamesPerWeek: Number.isFinite(sd.gamesPerWeek) ? Number(sd.gamesPerWeek) : DEFAULT_SETTINGS.scheduleDefaults.gamesPerWeek,
      gameLengthMinutes: Number.isFinite(sd.gameLengthMinutes)
        ? Number(sd.gameLengthMinutes)
        : DEFAULT_SETTINGS.scheduleDefaults.gameLengthMinutes,
      restDaysBetweenGames: Number.isFinite(sd.restDaysBetweenGames)
        ? Number(sd.restDaysBetweenGames)
        : DEFAULT_SETTINGS.scheduleDefaults.restDaysBetweenGames,
    },
  };
}
