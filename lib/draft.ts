// Pure logic, no I/O — kept separate so it's unit-testable without a live
// DB (see test/draft.test.mjs), same reasoning as lib/subdomain.mjs.

export interface DraftOrderSlot {
  pickNum: number;
  round: number;
  teamId: string;
}

// Standard snake draft: odd rounds go in team order, even rounds reverse.
export function buildSnakeOrder(teamIds: string[], rounds: number): DraftOrderSlot[] {
  const order: DraftOrderSlot[] = [];
  let pick = 1;
  for (let r = 1; r <= rounds; r++) {
    const forward = r % 2 === 1;
    const ids = forward ? teamIds : [...teamIds].reverse();
    for (const teamId of ids) order.push({ pickNum: pick++, round: r, teamId });
  }
  return order;
}

// Quote-aware comma/tab split — same algorithm the original single-tenant
// app used for its CSV/TSV roster upload.
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const splitLine = (line: string): string[] => {
    const vals: string[] = [];
    let cur = "", inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === sep && !inQuotes) { vals.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    vals.push(cur.trim());
    return vals;
  };
  const headers = splitLine(lines[0]).map((h) => h.replace(/^["']|["']$/g, "").trim());
  const rows = lines.slice(1).map((line) => {
    const vals = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ""; });
    return row;
  }).filter((row) => Object.values(row).some((v) => v));
  return { headers, rows };
}

// Best-effort header matching so a roster export from anywhere reasonable
// maps onto our fields, without requiring exact column names.
const HEADER_ALIASES: Record<string, string[]> = {
  firstName: ["first name", "firstname", "first"],
  lastName: ["last name", "lastname", "last"],
  division: ["division", "div", "age"],
  birthdate: ["birthdate", "birth date", "dob"],
};

export function autoMapHeaders(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const lower = headers.map((h) => h.toLowerCase());
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const i = lower.findIndex((h) => aliases.some((a) => h.includes(a)));
    if (i >= 0) map[field] = headers[i];
  }
  return map;
}
