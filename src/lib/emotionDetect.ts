// Client-side affect detection. No backend: we match the transcript against
// an emotion lexicon (explicit feeling words + colloquial tone words) and a
// short list of affect phrases, mapping each to a quadrant for color.

import { EMOTIONS, type Quadrant } from '../theme/emotions';

export interface Detected {
  /** surface text shown on the chip / highlighted in the transcript */
  text: string;
  /** null when the user edits a chip to something we can't classify */
  quadrant: Quadrant | null;
}

// Build the base lexicon from the canonical emotion vocabulary, then add
// everyday words people actually say out loud.
const LEXICON: Record<string, Quadrant> = {};

for (const q of Object.keys(EMOTIONS) as Quadrant[]) {
  for (const word of EMOTIONS[q]) {
    LEXICON[word.toLowerCase()] = q;
  }
}

const EXTRA: Record<string, Quadrant> = {
  // HEP — high energy positive
  great: 'hep', amazing: 'hep', awesome: 'hep', fantastic: 'hep', thrilled: 'hep',
  pumped: 'hep', stoked: 'hep', motivated: 'hep', energized: 'hep', alive: 'hep',
  buzzing: 'hep', radiant: 'hep', delighted: 'hep', overjoyed: 'hep',
  // LEP — low energy positive
  okay: 'lep', fine: 'lep', alright: 'lep', chill: 'lep', settled: 'lep',
  rested: 'lep', steady: 'lep', soothed: 'lep', mellow: 'lep', cozy: 'lep',
  safe: 'lep', balanced: 'lep', easy: 'lep', light: 'lep',
  // HEN — high energy negative
  mad: 'hen', pissed: 'hen', annoyed: 'hen', restless: 'hen', wired: 'hen',
  jittery: 'hen', panicky: 'hen', dread: 'hen', rattled: 'hen', snappy: 'hen',
  fuming: 'hen', livid: 'hen', worried: 'hen', scared: 'hen', afraid: 'hen',
  // LEN — low energy negative
  sad: 'len', blue: 'len', down: 'len', low: 'len', drained: 'len',
  flat: 'len', heavy: 'len', tired: 'len', weary: 'len', hollow: 'len',
  unmotivated: 'len', withdrawn: 'len', stuck: 'len', meh: 'len', blah: 'len',
};

for (const [w, q] of Object.entries(EXTRA)) LEXICON[w] = q;

// Multi-word tone phrases — these carry the feeling of a sentence even when
// no single word does ("yesterday was so draining" still hits "draining",
// but "burned out" / "on edge" only read as phrases).
const PHRASES: { phrase: string; quadrant: Quadrant }[] = [
  { phrase: 'burned out', quadrant: 'len' },
  { phrase: 'burnt out', quadrant: 'len' },
  { phrase: 'worn out', quadrant: 'len' },
  { phrase: 'wiped out', quadrant: 'len' },
  { phrase: 'let down', quadrant: 'len' },
  { phrase: 'shut down', quadrant: 'len' },
  { phrase: 'on edge', quadrant: 'hen' },
  { phrase: 'freaking out', quadrant: 'hen' },
  { phrase: 'fed up', quadrant: 'hen' },
  { phrase: 'stressed out', quadrant: 'hen' },
  { phrase: 'at peace', quadrant: 'lep' },
  { phrase: 'at ease', quadrant: 'lep' },
  { phrase: 'let go', quadrant: 'lep' },
  { phrase: 'over the moon', quadrant: 'hep' },
  { phrase: 'on top of the world', quadrant: 'hep' },
  { phrase: 'looking forward', quadrant: 'hep' },
];

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
