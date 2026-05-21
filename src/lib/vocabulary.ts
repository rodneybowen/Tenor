import { useEffect, useState } from 'react';
import type { Quadrant } from '../theme/emotions';

// Single source of truth for the emotion vocabulary. The sheet is
// published to web; Google auto-republishes after edits, so the
// site reflects vocabulary changes on the next page load — no
// rebuild or re-feed needed. If the fetch fails (offline, CORS,
// Google hiccup) the app falls back to the static built-in list.
const VOCAB_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vT5KKda8J5J40CV5DqxWREaXjmtm94qXsV_2S8j-ln7UQXWgJpBtROr9Cc-LvnidppyFarF9qK-1kgU/pub?output=csv';

export type Tier = 'Mild' | 'Moderate' | 'Strong' | 'Extreme';

export interface Emotion {
  name: string;
  tier: Tier;
  definition: string;
}

export type VocabByCategory = Record<Quadrant, Emotion[]>;

export interface Vocabulary {
  byCategory: VocabByCategory;
  /** Fast lookup for the definition card. */
  definitions: Record<string, string>;
}

const CATEGORY_TO_QUADRANT: Record<string, Quadrant> = {
  'high energy positive': 'hep',
  'low energy positive': 'lep',
  'high energy negative': 'hen',
  'low energy negative': 'len',
};
const TIER_ORDER: Tier[] = ['Mild', 'Moderate', 'Strong', 'Extreme'];

// Minimal RFC-4180-ish CSV parser — handles quoted fields with
// commas, embedded newlines, and "" escaped quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        continue;
      }
      cell += c;
    } else {
      if (c === '"') {
        inQuotes = true;
        continue;
      }
      if (c === ',') {
        row.push(cell);
        cell = '';
        continue;
      }
      if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        continue;
      }
      cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function buildVocabulary(rows: string[][]): Vocabulary {
  const byCategory: VocabByCategory = { hep: [], lep: [], hen: [], len: [] };
  const definitions: Record<string, string> = {};
  // Skip the header row; tolerate rows with fewer than 4 cells / blank lines.
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 4) continue;
    const cat = r[0].trim().toLowerCase();
    const tier = r[1].trim();
    const name = r[2].trim();
    const def = r[3].trim();
    const q = CATEGORY_TO_QUADRANT[cat];
    if (!q || !name) continue;
    if (!(TIER_ORDER as string[]).includes(tier)) continue;
    byCategory[q].push({ name, tier: tier as Tier, definition: def });
    definitions[name] = def;
  }
  // Make sure mild → strong order is enforced even if the sheet is
  // reshuffled — within a tier, in-sheet order is preserved.
  for (const q of Object.keys(byCategory) as Quadrant[]) {
    byCategory[q].sort(
      (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
    );
  }
  return { byCategory, definitions };
}

// Module-level cache so navigating in and out of the grid screen
// doesn't re-fetch.
let cache: Vocabulary | null = null;
let inflight: Promise<Vocabulary> | null = null;

export async function fetchVocabulary(): Promise<Vocabulary> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch(VOCAB_URL);
    if (!res.ok) {
      inflight = null;
      throw new Error(`vocabulary fetch failed: HTTP ${res.status}`);
    }
    const text = await res.text();
    const rows = parseCsv(text);
    const v = buildVocabulary(rows);
    cache = v;
    inflight = null;
    return v;
  })();
  return inflight;
}

/** React hook — returns vocab once loaded; null while in-flight or on error. */
export function useVocabulary(): { vocab: Vocabulary | null; error: string | null } {
  const [vocab, setVocab] = useState<Vocabulary | null>(cache);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (vocab) return;
    let alive = true;
    fetchVocabulary()
      .then((v) => {
        if (alive) setVocab(v);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [vocab]);
  return { vocab, error };
}
