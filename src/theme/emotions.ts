// Emotion model + color helpers.
// Four functional quadrants — these colors carry meaning and are the ONLY
// place the emotion palette is allowed to appear (per Tenor design rules).

export type Quadrant = 'hep' | 'lep' | 'hen' | 'len';

export type LogMode = 'speak' | 'type' | 'select';

/** Starburst-variant base emotion. NULL on the data model when a log
 *  came from classic mode or when the user picked the central "numb"
 *  chip. Used by the 6-lane visualization variant and to colour
 *  starburst chips. */
export type BaseEmotion =
  | 'surprise'
  | 'joy'
  | 'love'
  | 'fear'
  | 'anger'
  | 'sadness';

/** A single picked emotion in the emotion-selector flow. `baseEmotion`
 *  is only set when the selection comes from the starburst variant
 *  (and is null for the centre "numb" chip). Classic-variant
 *  selections leave it undefined. The existing `quadrant` field
 *  remains required for back-compat with all downstream chip
 *  rendering / chart code. */
export interface EmotionSelection {
  name: string;
  quadrant: Quadrant;
  baseEmotion?: BaseEmotion | null;
}

/** Starburst base → classic quadrant mapping. The quadrant column on
 *  log_chips stays populated even in starburst mode so the existing
 *  per-chip colouring pipeline (LogDetailScreen, EmotionReviewScreen,
 *  classic visualizations) keeps working. Choices reflect the rough
 *  energy/valence of each base emotion in Russell's circumplex. */
export const BASE_TO_QUADRANT: Record<BaseEmotion, Quadrant> = {
  surprise: 'hep',
  joy: 'hep',
  love: 'lep',
  fear: 'hen',
  anger: 'hen',
  sadness: 'len',
};

interface BaseEmotionMeta {
  /** User-facing label, title-cased. */
  label: string;
  /** Clockwise-from-top angle in degrees. */
  angle: number;
  /** Palette slug used to build CSS-variable lookups
   *  (`--{palette}-{shade}`). */
  palette:
    | 'feijoa'
    | 'ripe-lemon'
    | 'lilac-bush'
    | 'geraldine'
    | 'hit-pink'
    | 'picton-blue';
  /** Primary shade for the palette — `400` on five of the six,
   *  `500` on Lilac Bush (Love) since 400 is too light. */
  primaryShade: 400 | 500;
  /** Brief one-liner shown in the layer-1 definition card. */
  definition: string;
}

export const STARBURST_BASES: Record<BaseEmotion, BaseEmotionMeta> = {
  surprise: {
    label: 'Surprise',
    angle: 0,
    palette: 'feijoa',
    primaryShade: 400,
    definition: 'A jolt of the unexpected — caught off guard, eyes wide.',
  },
  joy: {
    label: 'Joy',
    angle: 60,
    palette: 'ripe-lemon',
    primaryShade: 400,
    definition: 'A bright, lifting fullness — gladness with energy behind it.',
  },
  love: {
    label: 'Love',
    angle: 120,
    palette: 'lilac-bush',
    primaryShade: 500,
    definition: 'Warm pull toward another — affection, tenderness, care.',
  },
  fear: {
    label: 'Fear',
    angle: 180,
    palette: 'geraldine',
    primaryShade: 400,
    definition: 'A bracing for harm — alert, exposed, on edge.',
  },
  anger: {
    label: 'Anger',
    angle: 240,
    palette: 'hit-pink',
    primaryShade: 400,
    definition: 'Heat that rises against something wrong — pushing back.',
  },
  sadness: {
    label: 'Sadness',
    angle: 300,
    palette: 'picton-blue',
    primaryShade: 400,
    definition: 'A heavy, slow ache — weighted by loss or what is missing.',
  },
};

/** Ring-2 (secondary) sub-emotions for each base from the Junto
 *  Institute emotion wheel. Strictly the secondary ring — NO ring-3
 *  terms (per Fix 4, Jul 1 2026). Kept to 4-6 per base so the bloom
 *  reads as a focused list, not a cloud. Names are lowercase here;
 *  Title-cased at render. */
export const STARBURST_SUB_EMOTIONS: Record<BaseEmotion, string[]> = {
  surprise: ['amazed', 'confused', 'astonished', 'overcome', 'moved'],
  joy:      ['optimistic', 'peaceful', 'proud', 'content', 'accepted'],
  love:     ['affectionate', 'romantic', 'sentimental', 'tender'],
  fear:     ['scared', 'anxious', 'insecure', 'rejected', 'helpless'],
  anger:    ['frustrated', 'aggressive', 'distant', 'jealous', 'irritable'],
  sadness:  ['hurt', 'depressed', 'lonely', 'guilty', 'disappointed'],
};

/** Classic-vocabulary → base-emotion lookup for back-mapping logs that
 *  pre-date starburst (no `base_emotion` column). Keys are lowercase.
 *  Built from the four classic quadrants:
 *    HEP + most LEP → joy   (positive affect, energy independent)
 *    LEP affection-y → love (warmth toward another)
 *    HEN anger-y    → anger
 *    HEN fear-y     → fear
 *    LEN            → sadness (Numb stays null — it's the centre chip) */
const CLASSIC_TO_BASE: Record<string, BaseEmotion> = {
  // joy
  cheerful: 'joy', optimistic: 'joy', amused: 'joy', hopeful: 'joy',
  happy: 'joy', enthusiastic: 'joy', proud: 'joy', excited: 'joy',
  inspired: 'joy', elated: 'joy', joyful: 'joy',
  calm: 'joy', comfortable: 'joy', relaxed: 'joy', 'at ease': 'joy',
  grounded: 'joy', content: 'joy', satisfied: 'joy', peaceful: 'joy',
  serene: 'joy',
  // love
  grateful: 'love', tender: 'love', thankful: 'love', accepted: 'love',
  // anger
  irritated: 'anger', frustrated: 'anger', angry: 'anger',
  furious: 'anger', disgusted: 'anger', agitated: 'anger',
  // fear
  anxious: 'fear', nervous: 'fear', stressed: 'fear',
  overwhelmed: 'fear', panicked: 'fear', tense: 'fear',
  // sadness
  bored: 'sadness', tired: 'sadness', disappointed: 'sadness',
  disconnected: 'sadness', sad: 'sadness', melancholy: 'sadness',
  lonely: 'sadness', exhausted: 'sadness', empty: 'sadness',
  defeated: 'sadness', hopeless: 'sadness',
};

/** Resolve an emotion word to one of the 6 starburst base emotions.
 *
 *  Used in the starburst chart variant to place legacy classic-mode
 *  logs into the correct lane — they don't carry a `base_emotion`
 *  column so we infer it from each chip word. Resolution order:
 *    1. Exact match in the starburst sub-emotion lists (cheap, exact)
 *    2. Lookup in CLASSIC_TO_BASE (covers the classic 4-quadrant
 *       vocabulary)
 *    3. null — unclassifiable; caller should drop the log from the
 *       starburst chart
 *
 *  Comparison is case-insensitive. Numb deliberately resolves to null
 *  (it's the centre chip, not a base). */
export function mapEmotionWordToBase(word: string): BaseEmotion | null {
  if (!word) return null;
  const lower = word.toLowerCase();
  if (lower === 'numb') return null;
  for (const base of Object.keys(STARBURST_SUB_EMOTIONS) as BaseEmotion[]) {
    if (STARBURST_SUB_EMOTIONS[base].includes(lower)) return base;
  }
  return CLASSIC_TO_BASE[lower] ?? null;
}

/** Case-insensitive emotion definition lookup. EMOTION_DEFINITIONS
 *  carries both Title-Case (classic vocabulary) and lowercase
 *  (starburst sub-emotion vocabulary) keys; this helper tries both
 *  plus the 6 base-emotion definitions held on STARBURST_BASES. */
export function getEmotionDefinition(word: string): string {
  if (!word) return '';
  const base = STARBURST_BASES[word as BaseEmotion];
  if (base) return base.definition;
  const exact = EMOTION_DEFINITIONS[word];
  if (exact) return exact;
  const titled = word.replace(/(^|[\s-])(\w)/g, (_, p, c) => p + c.toUpperCase());
  return EMOTION_DEFINITIONS[titled] ?? '';
}

/** Visualisation lane order for the starburst variant (matches the
 *  spec: Surprise → Joy → Love → Fear → Anger → Sadness). The
 *  vertical band layout in chart components follows this order. */
export const STARBURST_LANE_ORDER: BaseEmotion[] = [
  'surprise', 'joy', 'love', 'fear', 'anger', 'sadness',
];

/** Runtime RGB for each starburst base at its primary shade. Used by
 *  the 6-lane visualization variant where SVG `<stop>` colors and
 *  band fills need a real rgba() — CSS custom properties aren't
 *  resolvable inside `stopColor`. Mirrors the hex values declared
 *  in index.css. */
export const BASE_PRIMARY_RGB: Record<BaseEmotion, [number, number, number]> = {
  surprise: [143, 188, 95],   // Feijoa 400 — #8fbc5f
  joy:      [254, 235, 17],   // Ripe Lemon 400 — #feeb11
  love:     [161, 120, 222],  // Lilac Bush 500 — #a178de
  fear:     [252, 118, 121],  // Geraldine 400 — #fc7679
  anger:    [251, 113, 60],   // Hit Pink 400 — #fb713c
  sadness:  [81, 183, 231],   // Picton Blue 400 — #51b7e7
};

/** Variant-agnostic lane identifier — either one of the classic
 *  quadrants or one of the six starburst base emotions. The chart
 *  components plot points + colour bands by lane; helpers below
 *  resolve the colour and Y-position for either variant. */
export type LaneKey = Quadrant | BaseEmotion;

/** Runtime rgba() for any lane key. Starburst bases use
 *  BASE_PRIMARY_RGB; classic quadrants fall back to the QUADRANTS rgb. */
export function laneColor(key: LaneKey, alpha = 1): string {
  if (key in QUADRANTS) {
    const [r, g, b] = QUADRANTS[key as Quadrant].rgb;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const [r, g, b] = BASE_PRIMARY_RGB[key as BaseEmotion];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** CSS `var(...)` reference for a starburst palette at a given shade.
 *  Use this anywhere you need a base-emotion colour at runtime
 *  (chips, lanes, definition-card accents). Falls back to the
 *  palette primary shade when no shade is passed. */
export function baseEmotionColor(
  base: BaseEmotion,
  shade?: 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950,
): string {
  const meta = STARBURST_BASES[base];
  const s = shade ?? meta.primaryShade;
  return `var(--${meta.palette}-${s})`;
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
  // ── Starburst additions (Junto wheel sub-emotions). Keys are
  //    lowercase to match the lowercase storage in starburst mode;
  //    the renderer Title-cases on display. ────────────────────
  // Surprise
  stunned: 'Knocked still — too startled to react.',
  confused: 'Caught between possibilities — no clear footing.',
  amazed: 'Wonder rushing in — bigger than expected.',
  overcome: 'Swept up by a feeling too strong to hold back.',
  moved: 'Something landed inside you and shifted things.',
  stimulated: 'Switched on — senses alert, mind buzzing.',
  astonished: 'Knocked sideways by what just happened.',
  'awe-struck': "Hushed and small in the face of something vast.",
  speechless: 'Words gone — the moment outruns language.',
  astounded: 'Beyond surprise — disbelief still settling in.',
  // Joy
  delighted: 'A small, bright pleasure that lifts you.',
  jovial: 'Warmly playful — easy laughter close by.',
  pleased: 'A simple gladness with how things turned out.',
  playful: 'Light enough to tease and be silly.',
  tranquil: 'A soft, undisturbed quiet.',
  // Love
  enchanted: 'Caught in something beautiful — gently held there.',
  romantic: 'Tender, longing pull toward someone.',
  affectionate: 'Warm care that wants to reach out.',
  sentimental: 'Soft attachment to a memory or person.',
  appreciative: 'Aware of value in someone or something present.',
  nostalgic: "Sweet ache for a time that's passed.",
  compassionate: "Moved by another's pain — wanting to ease it.",
  warmhearted: 'Open, generous, easy to extend kindness.',
  passionate: 'Burning intensity for someone or something.',
  enamored: 'Deeply taken — eyes only for one.',
  rapturous: 'Carried away by joy so full it overflows.',
  enthralled: 'Held rapt — unable to look away.',
  jubilant: 'Loudly triumphant — joy that wants to celebrate.',
  // Fear
  scared: 'Pulled tight by something threatening.',
  terrified: 'Fear at its sharpest edge.',
  insecure: 'Unsteady — unsure of your footing or worth.',
  horrified: 'Recoiling from something deeply wrong.',
  frightened: 'Caught off guard by danger or its shadow.',
  helpless: 'Unable to act, change, or escape.',
  hysterical: "Fear that's broken loose of control.",
  inferior: 'Smaller-than next to someone or something.',
  inadequate: "Falling short of what's needed.",
  worried: 'Mind circling something that might go wrong.',
  mortified: 'Shame and fear of being seen — wanting to vanish.',
  dreadful: 'Heavy expectation of something bad ahead.',
  rejected: 'Cast out — wanted closeness and got a closed door.',
  // Anger
  irritable: 'Quick to bristle at small things.',
  aggressive: 'Pushing outward with force — ready to confront.',
  distant: "Pulled away — present in body, not in heart.",
  exasperated: 'Worn down by repeated frustration.',
  enraged: 'Anger at its loudest, hottest reach.',
  hostile: 'Set against — wanting to push back hard.',
  jealous: 'Resentful pull toward what someone else has.',
  hateful: 'A cold, hard turning away from something.',
  aggravated: 'Pestered into anger by something nagging.',
  resentful: 'Slow-burning anger over an old hurt.',
  envious: 'Wanting what another has, with a sting.',
  contemptuous: 'Looking down with cold dismissal.',
  revolted: 'Repulsed — turned away in disgust.',
  annoyed: 'Bothered just enough to lose patience.',
  // Sadness
  hurt: 'Wounded — something landed where it stings.',
  unhappy: 'A low, lingering "not okay".',
  shameful: 'Wishing you could disappear from being seen.',
  gloomy: 'A grey, low mood that colors everything.',
  isolated: "Cut off from the people who'd help.",
  neglected: "Treated as if you don't matter.",
  shocked: 'Knocked off your feet by something sudden.',
  bewildered: 'Sad and lost — nothing makes sense.',
  disillusioned: 'A belief crumbled — left holding the dust.',
  perplexed: 'Sad confusion — unable to see how to move.',
  agonized: 'Pain so sharp it bends you over.',
  disturbed: "Unsettled inside — won't sit still.",
  miserable: 'Sad to the point of suffering.',
  disheartened: 'Energy for trying drained away.',
  dismayed: 'Disappointment that lands as quiet shock.',
  displeased: "Quietly unhappy with what's happening.",
  regretful: "Wishing you'd chosen differently.",
  guilty: "Pressed down by something you did or didn't do.",
  depressed: 'A heavy, sustained absence of lift.',
  // Numb — centre chip of the starburst plane.
  numb: "Emotions out of reach — present but can't feel them.",

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

/** Mix a quadrant color toward white by `amt` (0–1). Use for solid
 *  pastel fills where you want the visual of a low-alpha overlay
 *  but need real opacity (e.g. UI sitting over a border line). */
export function tintQuadrant(q: Quadrant, amt: number, alpha = 1): string {
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
 * Soft, blurry circular blend representing per-quadrant counts. Each
 * quadrant is anchored to its own corner of the circle (matching the
 * emotion-grid layout) and renders as a radial-gradient layer. The
 * **most prevalent** quadrant paints last with the largest radius and
 * strongest alpha — so it visibly dominates the blob — while the
 * remaining quadrants leave faint accent tints in their corners.
 * Returns a `background` value (CSS multi-radial-gradient stack).
 */
export function quadrantBlendBackground(
  counts: Partial<Record<Quadrant, number>>,
): string {
  const items = (Object.keys(QUADRANTS) as Quadrant[])
    .map((q) => ({ q, n: counts[q] ?? 0 }))
    .filter((x) => x.n > 0);
  if (items.length === 0) return 'transparent';

  const total = items.reduce((s, x) => s + x.n, 0);

  // Corner anchors: HEP top-left, HEN top-right, LEP bottom-left, LEN bottom-right
  // (matches the emotion-grid quadrant positions).
  const corners: Record<Quadrant, [number, number]> = {
    hep: [22, 22],
    hen: [78, 22],
    lep: [22, 78],
    len: [78, 78],
  };

  // Paint smallest first so largest sits on top.
  const sorted = [...items].sort((a, b) => a.n - b.n);
  const layers = sorted.map(({ q, n }, idx) => {
    const frac = n / total;
    const [x, y] = corners[q];
    const isMost = idx === sorted.length - 1;
    // Dominant gets a wide, near-opaque wash; minor accents stay subtle.
    const alpha = isMost ? Math.min(1, 0.7 + frac * 0.3) : 0.3 + frac * 0.35;
    const radius = isMost ? 80 : 35 + frac * 25;
    return `radial-gradient(circle at ${x}% ${y}%, ${quadrantColor(
      q,
      alpha,
    )} 0%, transparent ${radius}%)`;
  });

  return layers.join(', ');
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
    return `linear-gradient(150deg, ${tintQuadrant(qs[0], 0.34)} 0%, ${quadrantColor(
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
