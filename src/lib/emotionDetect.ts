// Client-side affect detection. No backend: we match the transcript against
// an emotion lexicon (every keyword from the shared Google Sheet, plus a
// short list of everyday colloquialisms that aren't in the clinical sheet)
// and a list of multi-word affect phrases, mapping each to a quadrant for
// color.

import type { Quadrant } from '../theme/emotions';
import { SHEET_PHRASES, SHEET_WORDS } from '../data/sheetVocabulary';

export interface Detected {
  /** surface text shown on the chip / highlighted in the transcript */
  text: string;
  /** null when the user edits a chip to something we can't classify */
  quadrant: Quadrant | null;
}

// Primary lexicon: every single-token keyword the user's canonical sheet
// defines. Lowercase keys.
const LEXICON: Record<string, Quadrant> = { ...SHEET_WORDS };

// Everyday colloquial words that are missing from the clinical sheet but
// people actually say / type. Kept small — the sheet is the source of
// truth. Each line notes the sheet word it stands in for.
const EXTRA: Record<string, Quadrant> = {
  // HEP — colloquial gaps around joy/excitement
  happy: 'hep',       // sheet has cheerful/content/chipper, not plain "happy"
  great: 'hep',
  amazing: 'hep',
  awesome: 'hep',
  fantastic: 'hep',
  pumped: 'hep',      // sheet has hyped/amped
  stoked: 'hep',      // sheet has thrilled/stoked but as "/" alt
  motivated: 'hep',
  alive: 'hep',
  // LEP — colloquial gaps around calm/ease
  fine: 'lep',
  alright: 'lep',
  soothed: 'lep',
  easy: 'lep',
  light: 'lep',
  // HEN — colloquial gaps around anger/fear
  scared: 'hen',      // sheet has spooked/terrified/threatened
  afraid: 'hen',
  worried: 'hen',     // sheet has apprehensive/anxious
  dread: 'hen',
  rattled: 'hen',
  snappy: 'hen',
  fuming: 'hen',
  wired: 'hen',
  // LEN — colloquial gaps around sadness/exhaustion
  blue: 'len',        // slang for sad
  down: 'len',        // sheet has "Down / Bummed out" but ensure it's keyed
  flat: 'len',
  stuck: 'len',
  meh: 'len',
  withdrawn: 'len',
  hollow: 'len',      // sheet has it under LEN strong already — safe no-op
  weary: 'len',       // sheet has it under LEN moderate — safe no-op
};

for (const [w, q] of Object.entries(EXTRA)) {
  if (!(w in LEXICON)) LEXICON[w] = q;
}

// Multi-word tone phrases. Sheet-sourced phrases first (built from the
// Google Sheet), then a handful of common idioms the sheet doesn't list.
const SHEET_PHRASE_ENTRIES: { phrase: string; quadrant: Quadrant }[] =
  Object.entries(SHEET_PHRASES).map(([phrase, quadrant]) => ({ phrase, quadrant }));

const EXTRA_PHRASES: { phrase: string; quadrant: Quadrant }[] = [
  { phrase: 'burned out', quadrant: 'len' },     // US spelling; sheet has "burnt out"
  { phrase: 'worn out',   quadrant: 'len' },
  { phrase: 'wiped out',  quadrant: 'len' },
  { phrase: 'let down',   quadrant: 'len' },
  { phrase: 'shut down',  quadrant: 'len' },
  { phrase: 'on edge',    quadrant: 'hen' },
  { phrase: 'freaking out', quadrant: 'hen' },
  { phrase: 'fed up',     quadrant: 'hen' },
  { phrase: 'stressed out', quadrant: 'hen' },
  { phrase: 'at peace',   quadrant: 'lep' },
  { phrase: 'let go',     quadrant: 'lep' },
  { phrase: 'over the moon', quadrant: 'hep' },
  { phrase: 'on top of the world', quadrant: 'hep' },
  { phrase: 'looking forward', quadrant: 'hep' },
];

// Longer phrases first so a match on "sick to my stomach" wins before any
// short phrase inside it would.
const PHRASES: { phrase: string; quadrant: Quadrant }[] = [
  ...SHEET_PHRASE_ENTRIES,
  ...EXTRA_PHRASES,
].sort((a, b) => b.phrase.length - a.phrase.length);

function normalize(token: string): string {
  return token.toLowerCase().replace(/[^a-z]/g, '');
}

// Light stemming so "draining"/"drained", "calmer"/"calm",
// "lonelier"/"lonely", "tiredness"/"tired" all resolve to one lexicon entry.
function lookup(word: string): Quadrant | null {
  if (LEXICON[word]) return LEXICON[word];
  const stems = [
    word.replace(/ing$/, ''),
    word.replace(/ing$/, 'e'),
    word.replace(/ing$/, 'ed'),
    word.replace(/ed$/, ''),
    word.replace(/ed$/, 'e'),
    word.replace(/ier$/, 'y'),
    word.replace(/iest$/, 'y'),
    word.replace(/er$/, ''),
    word.replace(/est$/, ''),
    word.replace(/ness$/, ''),
    word.replace(/ly$/, ''),
    word.replace(/s$/, ''),
  ];
  for (const s of stems) {
    if (s.length > 2 && LEXICON[s]) return LEXICON[s];
  }
  return null;
}

/** Classify a single word or short phrase a user typed into an edited chip. */
export function classify(text: string): Quadrant | null {
  const clean = text.trim().toLowerCase();
  if (!clean) return null;
  const phrase = PHRASES.find((p) => clean === p.phrase || clean.includes(p.phrase));
  if (phrase) return phrase.quadrant;
  for (const raw of clean.split(/\s+/)) {
    const hit = lookup(normalize(raw));
    if (hit) return hit;
  }
  return null;
}

/**
 * Pull the emotional content out of a transcript: affect phrases first, then
 * single feeling/tone words. De-duped by lemma, in spoken order.
 */
export function extractEmotions(transcript: string): Detected[] {
  const lower = transcript.toLowerCase();
  const found: Detected[] = [];
  const seen = new Set<string>();

  for (const { phrase, quadrant } of PHRASES) {
    if (lower.includes(phrase) && !seen.has(phrase)) {
      seen.add(phrase);
      found.push({ text: phrase, quadrant });
    }
  }

  for (const rawToken of transcript.split(/\s+/)) {
    const norm = normalize(rawToken);
    if (norm.length < 3) continue;
    const q = lookup(norm);
    if (q && !seen.has(norm)) {
      seen.add(norm);
      found.push({ text: rawToken.replace(/[^a-zA-Z]/g, ''), quadrant: q });
    }
  }

  return found;
}

/** Used by the live transcript to underline matched words as they're spoken. */
export function classifyWord(rawToken: string): Quadrant | null {
  const norm = normalize(rawToken);
  if (norm.length < 3) return null;
  return lookup(norm);
}

/** Phrase spans in `text` so a live renderer can mark multi-word idioms
 *  ("burnt out", "on cloud nine") as one unit instead of letting the
 *  word-level tokenizer miss them. Longest phrases match first;
 *  overlapping shorter matches are skipped. Only word-boundary matches
 *  count — "at ease" won't match inside "wheat easel". */
export function findPhraseMatches(
  text: string,
): Array<{ start: number; end: number; quadrant: Quadrant }> {
  const lower = text.toLowerCase();
  const matches: Array<{ start: number; end: number; quadrant: Quadrant }> = [];
  const used = new Array<boolean>(text.length).fill(false);
  for (const { phrase, quadrant } of PHRASES) {
    let idx = 0;
    while ((idx = lower.indexOf(phrase, idx)) !== -1) {
      const end = idx + phrase.length;
      let overlaps = false;
      for (let i = idx; i < end; i++) if (used[i]) { overlaps = true; break; }
      const beforeOk = idx === 0 || !/[A-Za-z]/.test(text[idx - 1]);
      const afterOk = end >= text.length || !/[A-Za-z]/.test(text[end]);
      if (!overlaps && beforeOk && afterOk) {
        matches.push({ start: idx, end, quadrant });
        for (let i = idx; i < end; i++) used[i] = true;
      }
      idx = end;
    }
  }
  matches.sort((a, b) => a.start - b.start);
  return matches;
}
