// Emotion model + color helpers.
// Four functional quadrants — these colors carry meaning and are the ONLY
// place the emotion palette is allowed to appear (per Tenor design rules).

export type Quadrant = 'hep' | 'lep' | 'hen' | 'len';

export type LogMode = 'speak' | 'type' | 'scan' | 'select';

/** A single picked emotion in the emotion-selector flow. */
export interface EmotionSelection {
  name: string;
  quadrant: Quadrant;
}

interface QuadrantMeta {
  label: string;
  short: string;
  /** Base RGB used for dots, tags and blended gradients. Muted, not pale. */
  rgb: [number, number, number];
}

export const QUADRANTS: Record<Quadrant, QuadrantMeta> = {
  hep: { label: 'High Energy Positive', short: 'HEP', rgb: [238, 210, 108] }, // sun yellow
  lep: { label: 'Low Energy Positive', short: 'LEP', rgb: [130, 196, 152] }, // spring green
  hen: { label: 'High Energy Negative', short: 'HEN', rgb: [224, 138, 132] }, // coral red
  len: { label: 'Low Energy Negative', short: 'LEN', rgb: [130, 152, 212] }, // ribbon blue
};

export const EMOTIONS: Record<Quadrant, string[]> = {
  hep: ['Excited', 'Happy', 'Inspired', 'Grateful', 'Proud', 'Hopeful', 'Amused', 'Enthusiastic', 'Joyful', 'Elated', 'Cheerful', 'Optimistic'],
  lep: ['Calm', 'Content', 'Peaceful', 'Relaxed', 'Satisfied', 'Serene', 'Thankful', 'At ease', 'Tender', 'Accepted', 'Comfortable', 'Grounded'],
  hen: ['Anxious', 'Angry', 'Stressed', 'Overwhelmed', 'Frustrated', 'Irritated', 'Panicked', 'Nervous', 'Furious', 'Tense', 'Agitated', 'Disgusted'],
  len: ['Sad', 'Tired', 'Lonely', 'Hopeless', 'Empty', 'Melancholy', 'Disconnected', 'Numb', 'Bored', 'Exhausted', 'Disappointed', 'Defeated'],
};

/**
 * Mild → strong ordering used by the emotion grid: chips with a higher
 * intensity rank sit farther from the center of the grid (closer to the
 * outer corner of their quadrant). Index 0 = mildest, length-1 = strongest.
 */
export const INTENSITY_ORDER: Record<Quadrant, string[]> = {
  hep: ['Cheerful', 'Optimistic', 'Amused', 'Hopeful', 'Happy', 'Grateful', 'Enthusiastic', 'Proud', 'Excited', 'Inspired', 'Elated', 'Joyful'],
  lep: ['At ease', 'Comfortable', 'Grounded', 'Calm', 'Tender', 'Relaxed', 'Content', 'Satisfied', 'Thankful', 'Accepted', 'Peaceful', 'Serene'],
  hen: ['Tense', 'Irritated', 'Nervous', 'Agitated', 'Anxious', 'Frustrated', 'Stressed', 'Overwhelmed', 'Disgusted', 'Panicked', 'Angry', 'Furious'],
  len: ['Bored', 'Tired', 'Disappointed', 'Disconnected', 'Sad', 'Melancholy', 'Lonely', 'Numb', 'Exhausted', 'Empty', 'Defeated', 'Hopeless'],
};

/**
 * Short, plain-language definitions surfaced under the centered chip in
 * the emotion grid. Kept ~1 sentence so the card stays compact.
 */
export const EMOTION_DEFINITIONS: Record<string, string> = {
  // HEP — high energy positive
  Cheerful: 'A light, bright mood — quietly upbeat and warm.',
  Optimistic: 'Expecting good things to come.',
  Amused: 'Quietly entertained or tickled by something.',
  Hopeful: 'Believing things will work out, even amid uncertainty.',
  Happy: 'A simple, settled sense of well-being.',
  Grateful: 'Appreciative of what — or who — you have.',
  Enthusiastic: 'Energized and eager to engage.',
  Proud: 'Pleased with yourself or something you achieved.',
  Excited: 'Buzzing with anticipation.',
  Inspired: 'Sparked into wanting to create or act.',
  Elated: 'Lifted and high-spirited, almost soaring.',
  Joyful: 'A bright, exuberant fullness of heart.',
  // LEP — low energy positive
  'At ease': 'Comfortable in the moment, no tension to manage.',
  Comfortable: 'Settled and unbothered.',
  Grounded: 'Centered and present in your body.',
  Calm: 'Quietly composed, free of agitation.',
  Tender: 'Softly warm, sometimes a little fragile.',
  Relaxed: 'Released from stress; body unwound.',
  Content: 'Satisfied with what is, not wanting more.',
  Satisfied: 'A sense that things are enough.',
  Thankful: 'Warmly aware of a gift received.',
  Accepted: 'Feeling like you belong as you are.',
  Peaceful: 'Inner quiet; the mind not pulling at anything.',
  Serene: 'A deep, untroubled stillness.',
  // HEN — high energy negative
  Tense: 'Mind or body holding tight.',
  Irritated: 'Mildly bothered; the edge of patience worn.',
  Nervous: 'Apprehensive about something coming.',
  Agitated: 'Stirred up; hard to sit still.',
  Anxious: "Persistent worry the body can't shake.",
  Frustrated: 'Blocked from what you want — energy with no outlet.',
  Stressed: 'Carrying more than feels manageable.',
  Overwhelmed: 'Too much input or pressure at once.',
  Disgusted: 'Strong aversion or revulsion.',
  Panicked: 'A sudden, sharp surge of alarm.',
  Angry: 'A heated, energized response to harm or wrong.',
  Furious: 'Anger at its fullest intensity.',
  // LEN — low energy negative
  Bored: 'Disengaged; nothing pulls your interest.',
  Tired: 'The body asking for rest.',
  Disappointed: "An expectation that didn't land.",
  Disconnected: 'Distant from people, place, or yourself.',
  Sad: 'A heavy, quiet ache.',
  Melancholy: 'A soft, reflective sadness — sometimes wistful.',
  Lonely: 'Aware of an absence of close company.',
  Numb: 'Emotions muted or out of reach.',
  Exhausted: 'Past tired — depleted in body and spirit.',
  Empty: 'Hollow, like something important is missing.',
  Defeated: 'Worn down to giving up.',
  Hopeless: 'Unable to see a way forward.',
};

export function quadrantColor(q: Quadrant, alpha = 1): string {
  const [r, g, b] = QUADRANTS[q].rgb;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Unique quadrants present, preserving first-seen order. */
function uniqueQuadrants(quadrants: Quadrant[]): Quadrant[] {
  return [...new Set(quadrants)];
}

/** Mix a quadrant color toward white by `amt` (0–1). */
function tint(q: Quadrant, amt: number, alpha = 1): string {
  const [r, g, b] = QUADRANTS[q].rgb;
  const m = (c: number) => Math.round(c + (255 - c) * amt);
  return `rgba(${m(r)}, ${m(g)}, ${m(b)}, ${alpha})`;
}

/** Darken a quadrant color toward black by `amt` (0–1). Used for the
 *  selected-state ring so it reads as a deeper variant of the fill. */
export function shadeQuadrant(q: Quadrant, amt: number, alpha = 1): string {
  const [r, g, b] = QUADRANTS[q].rgb;
  const m = (c: number) => Math.max(0, Math.round(c * (1 - amt)));
  return `rgba(${m(r)}, ${m(g)}, ${m(b)}, ${alpha})`;
}

/**
 * Fill for a day dot — always a soft gradient. A single emotion reads as a
 * gently lit sphere of that hue; multiple emotions melt smoothly into one
 * another (no hard pie slices).
 */
export function dotBackground(quadrants: Quadrant[]): string {
  const qs = uniqueQuadrants(quadrants);
  if (qs.length === 0) return 'transparent';
  if (qs.length === 1) {
    return `linear-gradient(150deg, ${tint(qs[0], 0.34)} 0%, ${quadrantColor(
      qs[0],
      0.95,
    )} 100%)`;
  }
  const stops = qs.map((q) => quadrantColor(q, 0.92)).join(', ');
  return `linear-gradient(150deg, ${stops})`;
}

/**
 * Soft tinted wash behind a log card — blends the colors of every emotion
 * logged in that entry. Stays light so card text keeps WCAG contrast.
 */
export function blendGradient(quadrants: Quadrant[]): string {
  const qs = uniqueQuadrants(quadrants);
  if (qs.length === 0) return 'rgba(255, 255, 255, 0.55)';
  if (qs.length === 1) {
    return `linear-gradient(135deg, ${quadrantColor(qs[0], 0.26)}, ${quadrantColor(qs[0], 0.12)})`;
  }
  const stops = qs.map((q) => quadrantColor(q, 0.22)).join(', ');
  return `linear-gradient(135deg, ${stops})`;
}
