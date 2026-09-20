import {
  CONTENT_RATING,
  firstJson,
  generate,
  type Generated,
  type ModelProvider,
} from './providers';
import { BLOOM_VOCABULARY } from './bloomVocabulary';

/** Every AI-written word in the app: the word search's topic list, Daily
 * Word's answers, and Hangman's words and clues.
 *
 * Each generator is the same three parts — build a prompt, parse and
 * validate what comes back, and hand both to generate() to run down the
 * provider chain. Validation is the important half: the prompts ask for
 * constraints the models mostly respect, and this is what makes "mostly"
 * safe to build a game on. */

// ---------------------------------------------------------------- fallbacks

/** Last-resort answers for Daily Word. A day must always have a word — if
 * every provider is down the family still gets a puzzle, and because the
 * pick is seeded by the date everyone gets the same one. */
const FALLBACK_DAILY = [
  'CRANE', 'PLANT', 'BRAVE', 'SHINE', 'TIGER', 'MONTH', 'QUILT', 'FROST',
  'SNACK', 'OCEAN', 'PIANO', 'BREAD', 'CLOUD', 'GRAPE', 'HONEY', 'JOLLY',
  'KNEEL', 'LEMON', 'MAPLE', 'NOBLE', 'OTTER', 'PORCH', 'QUIET', 'RIVER',
  'STORM', 'TRAIN', 'UNCLE', 'VOWEL', 'WAGON', 'YOUTH', 'ZEBRA', 'BEACH',
  'CHARM', 'DREAM', 'EAGLE', 'FLAME', 'GHOST', 'HEART', 'IVORY', 'JUICE',
  'KNIFE', 'LUCKY', 'MAGIC', 'NIGHT', 'OLIVE', 'PEARL', 'QUACK', 'ROBOT',
  'SHARK', 'TOWER', 'URBAN', 'VIVID', 'WHALE', 'YACHT', 'ZESTY', 'BLOOM',
  'CANDY', 'DANCE', 'EMBER', 'FROGS', 'GLOVE', 'HOTEL', 'INDEX', 'JEWEL',
];

/** Last-resort words for solo Hangman, by category id. Deliberately deep:
 * a thin list repeats within a single sitting, and unlike Daily Word — where
 * one word covers the whole day — a player can burn through ten of these in
 * ten minutes. This is also the only layer that survives with no signal at
 * all, which no second provider can help with. */
const FALLBACK_HANGMAN: Record<string, { word: string; hint: string }[]> = {
  animals: [
    { word: 'PENGUIN', hint: 'Dresses for dinner, swims for lunch' },
    { word: 'GIRAFFE', hint: 'Tallest head in the room' },
    { word: 'DOLPHIN', hint: 'Clever swimmer that clicks' },
    { word: 'SQUIRREL', hint: 'Buries snacks and forgets where' },
    { word: 'FLAMINGO', hint: 'Pink, and stands on one leg' },
    { word: 'OCTOPUS', hint: 'Eight arms, three hearts' },
    { word: 'HEDGEHOG', hint: 'A pincushion that snuffles' },
    { word: 'CHEETAH', hint: 'Fastest sprinter on land' },
    { word: 'TORTOISE', hint: 'Carries its house, never hurries' },
    { word: 'RACCOON', hint: 'Masked raider of bins' },
    { word: 'PANTHER', hint: 'A big cat in the dark' },
    { word: 'WALRUS', hint: 'Tusks and a fine moustache' },
  ],
  food: [
    { word: 'PANCAKE', hint: 'Flipped for breakfast' },
    { word: 'SPAGHETTI', hint: 'Long and twirled on a fork' },
    { word: 'PINEAPPLE', hint: 'Spiky outside, sweet inside' },
    { word: 'POPCORN', hint: 'Bursts in the heat' },
    { word: 'MUSHROOM', hint: 'Grows in the dark, tops a pizza' },
    { word: 'CHOCOLATE', hint: 'Melts in a warm pocket' },
    { word: 'SANDWICH', hint: 'Named after an earl' },
    { word: 'PORRIDGE', hint: 'Too hot, too cold, just right' },
    { word: 'WAFFLE', hint: 'Full of little square pockets' },
    { word: 'AVOCADO', hint: 'Green, with a big stone inside' },
    { word: 'NOODLES', hint: 'Slurped from a bowl' },
    { word: 'PUMPKIN', hint: 'Pie in autumn, lantern at night' },
  ],
  sports: [
    { word: 'SOCCER', hint: 'Played with feet and a round ball' },
    { word: 'HOCKEY', hint: 'Sticks, skates and a puck' },
    { word: 'TENNIS', hint: 'Love means nothing here' },
    { word: 'CRICKET', hint: 'Bats, wickets, and very long days' },
    { word: 'CYCLING', hint: 'Two wheels and a lot of hills' },
    { word: 'ARCHERY', hint: 'Aim for the middle ring' },
    { word: 'SWIMMING', hint: 'Lengths up and down the lane' },
    { word: 'CLIMBING', hint: 'Up the wall, on purpose' },
    { word: 'ROWING', hint: 'Facing backwards, going forwards' },
    { word: 'SKATING', hint: 'Spins and figures on ice' },
    { word: 'MARATHON', hint: 'Twenty-six miles of regret' },
    { word: 'JUDO', hint: 'Throws, holds, and a coloured belt' },
  ],
  places: [
    { word: 'LIBRARY', hint: 'Quiet, full of stories' },
    { word: 'AIRPORT', hint: 'Where journeys take off' },
    { word: 'MOUNTAIN', hint: 'You climb it for the view' },
    { word: 'HARBOUR', hint: 'Where boats come home' },
    { word: 'CASTLE', hint: 'Moat optional, towers essential' },
    { word: 'DESERT', hint: 'Sand as far as you can see' },
    { word: 'VILLAGE', hint: 'Smaller than a town' },
    { word: 'MUSEUM', hint: 'Old things behind glass' },
    { word: 'JUNGLE', hint: 'Thick, green and loud' },
    { word: 'STADIUM', hint: 'Thousands of seats, one pitch' },
    { word: 'LIGHTHOUSE', hint: 'Warns ships off the rocks' },
    { word: 'MARKET', hint: 'Stalls, haggling and fresh bread' },
  ],
  household: [
    { word: 'TOASTER', hint: 'Pops up in the morning' },
    { word: 'BLANKET', hint: 'Keeps you warm on the sofa' },
    { word: 'UMBRELLA', hint: 'Only useful when it rains' },
    { word: 'KETTLE', hint: 'Whistles when it is ready' },
    { word: 'CUSHION', hint: 'Soft, and always on the floor' },
    { word: 'MIRROR', hint: 'Shows you back to yourself' },
    { word: 'DRAWER', hint: 'Where odd things go to hide' },
    { word: 'CURTAIN', hint: 'Drawn at bedtime' },
    { word: 'LADDER', hint: 'Rungs to the high shelf' },
    { word: 'HOOVER', hint: 'Loud, and eats the crumbs' },
    { word: 'TEAPOT', hint: 'Short and stout, so they say' },
    { word: 'DOORBELL', hint: 'Rings, and the dog goes mad' },
  ],
  space: [
    { word: 'COMET', hint: 'A snowball with a tail' },
    { word: 'GALAXY', hint: 'Billions of stars together' },
    { word: 'ROCKET', hint: 'Goes up with a roar' },
    { word: 'ECLIPSE', hint: 'When one hides the other' },
    { word: 'ASTEROID', hint: 'A rock with its own orbit' },
    { word: 'SATURN', hint: 'The one wearing rings' },
    { word: 'CRATER', hint: 'A dent from a big impact' },
    { word: 'ORBIT', hint: 'Going round and round' },
    { word: 'TELESCOPE', hint: 'Brings the far things near' },
    { word: 'METEOR', hint: 'A wish as it streaks past' },
    { word: 'GRAVITY', hint: 'What keeps you on the ground' },
    { word: 'ASTRONAUT', hint: 'Floats at work' },
  ],
  anything: [
    { word: 'PUZZLE', hint: 'Pieces that need a place' },
    { word: 'GUITAR', hint: 'Six strings and a song' },
    { word: 'RAINBOW', hint: 'Seven colours after the rain' },
    { word: 'COMPASS', hint: 'Always points one way' },
    { word: 'THUNDER', hint: 'Arrives just after the flash' },
    { word: 'BICYCLE', hint: 'You never forget how' },
    { word: 'LANTERN', hint: 'A light you carry' },
    { word: 'WHISPER', hint: 'Said, but only just' },
    { word: 'JOURNEY', hint: 'The bit before arriving' },
    { word: 'MAGNET', hint: 'Pulls without touching' },
    { word: 'SHADOW', hint: 'Follows you, never speaks' },
    { word: 'BALLOON', hint: 'Rises until it does not' },
  ],
};

export interface HangmanWord {
  word: string;
  hint: string;
}

function pickSeeded<T>(list: T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

/** Deterministic per-day fallback, so every family member who loads the
 * day after an outage still lands on the same word. */
export function fallbackDailyWord(dateKey: string): string {
  let hash = 0;
  for (const char of dateKey) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return pickSeeded(FALLBACK_DAILY, hash);
}

export function fallbackHangmanWord(
  category: string,
  avoid: string[] = []
): HangmanWord {
  const pool = FALLBACK_HANGMAN[category] ?? FALLBACK_HANGMAN.anything;
  const avoidSet = new Set(avoid.map((word) => word.toUpperCase()));
  // Same reasoning as the AI generators: skip anything just played so a
  // provider outage doesn't turn into its own kind of repetition.
  // Falls back to the full pool if avoiding would leave nothing to pick.
  const usable = pool.filter((entry) => !avoidSet.has(entry.word));
  return pickSeeded(usable.length > 0 ? usable : pool, Math.floor(Math.random() * 1e6));
}

// ------------------------------------------------------- word search topics

/** How few words makes a topic not worth building a grid from. */
export const MIN_TOPIC_WORDS = 4;

/** Words for a word-search grid on a topic.
 *
 * This is the generator where a total failure is most visible: there's no
 * bundled fallback, because the whole point is the topic the player just
 * typed. Coming up empty means telling them to try a different topic — for
 * a topic that was fine. So it runs down the full provider chain. */
export async function generateTopicWords(
  providers: ModelProvider[],
  topic: string
): Promise<Generated<string[]>> {
  // Ask for more than we need: some fraction always gets filtered out below
  // (too long once joined, duplicates, non-letter tokens), and topics whose
  // natural vocabulary skews toward long compound names (ride/place names,
  // character names) lose more than average.
  const prompt = `Give me 20 single words for a word-search puzzle about "${topic}".
Rules:
- If the topic itself is clearly inappropriate for a family app, do not generate any words. Instead respond with exactly: []
${CONTENT_RATING}
- Each word must be a single unbroken token of only letters A-Z (no spaces, hyphens, numbers, or punctuation) — join multi-word names/phrases into one word, e.g. "TAYLORSWIFT" not "Taylor Swift".
- Each word must be 3 to 10 letters long.
- Prefer common, recognizable words.
- Respond with ONLY a JSON array of the words as strings, nothing else. Example: ["EXAMPLE","WORDS","HERE"]`;

  return generate(
    'generateTopicWords',
    providers,
    prompt,
    (text) => parseWordList(text, /^[A-Z]{3,10}$/, 20),
    (words) => words.length < MIN_TOPIC_WORDS,
    []
  );
}

// ------------------------------------------------------------- daily word

/** The bootstrap prompt for topping up the shared Wordle pool
 * (wordBank.ts's `fetchWords`) — this is the one caller with quality rules
 * the generic shape filter can't express: a plural ending in S makes the
 * last letter a giveaway, and a proper noun is a famously bad Wordle
 * answer, neither of which "5 letters, no spaces" catches on its own. */
export function buildWordleBootstrapPrompt(count: number): string {
  return `Give me ${count} candidate answers for a Wordle-style puzzle played by a family.
Rules:
- Each must be exactly 5 letters, A-Z only, a single English word.
- No proper nouns, no plurals ending in S, no abbreviations, no slang.
- Vocabulary a 13-year-old would recognize — familiar words, nothing obscure or technical.
${CONTENT_RATING}
- Respond with ONLY a JSON array of uppercase words, nothing else. Example: ["CRANE","PLANT"]`;
}

/** Five-letter answers, avoiding any used recently. Returns every candidate
 * that survives validation — the daily word takes one, free play takes the
 * lot and plays through them, so a round of free play costs no request. */
export async function generateWordleWords(
  providers: ModelProvider[],
  recentWords: string[],
  count = 10
): Promise<Generated<string[]>> {
  const avoid = recentWords.length
    ? `\n- Do NOT use any of these recently used words: ${recentWords.join(', ')}.`
    : '';

  const prompt = `Give me ${count} candidate answers for a Wordle-style puzzle played by a family.
Rules:
- Each must be exactly 5 letters, A-Z only, a single English word.
- No proper nouns, no plurals ending in S, no abbreviations, no slang.
- Vocabulary a 13-year-old would recognize — familiar words, nothing obscure or technical.
${CONTENT_RATING}${avoid}
- Respond with ONLY a JSON array of uppercase words, nothing else. Example: ["CRANE","PLANT"]`;

  const recent = new Set(recentWords.map((word) => word.toUpperCase()));
  return generate(
    'generateWordleWords',
    providers,
    prompt,
    (text) =>
      // The trailing-S check catches the plurals the prompt asks it to avoid
      // and that it produces anyway — a plural answer makes the last letter
      // a giveaway and sours the whole day for everyone.
      parseWordList(text, /^[A-Z]{5}$/, count).filter(
        (word) => !word.endsWith('S') && !recent.has(word)
      ),
    (words) => words.length === 0,
    [],
    // Three attempts per provider, not two: this is the one call whose
    // failure is felt by everyone at once.
    3
  );
}

// ---------------------------------------------------------------- hangman

// A clue that just restates the word in other words is a dead giveaway —
// "A frozen treat in a cone" for ICE CREAM barely counts as a puzzle. Both
// hangman prompts below share this instruction block so the two can't drift
// to different standards of "vague enough," anchored with worked examples
// since "be vague" alone is a weak instruction on its own.
const VAGUE_CLUE_RULES = `- The clue must be genuinely tricky, not a dictionary definition — a player should have to think sideways, not just recognize a paraphrase.
- Do not describe what the word obviously IS or DOES. Hint at it indirectly instead — a feeling, a scene, a fact, wordplay, or a riddle.
- Do not name the category the answer belongs to. "A bird that…", "a kind of pasta", "an animal from…" all give away most of the work.
- Avoid close synonyms of the word or of its own category, and avoid its defining property — the one fact everyone lists first about it.
- Write from a slant: a moment it turns up in, what it is mistaken for, what it leaves behind, how someone feels about it. Never "X is a Y that Zs".
- Someone who already knows the answer should nod; someone who doesn't should need a real guess. If your clue would let a player name the answer without a single letter on the board, it is too obvious — write a different one.
- Write at a middle-school reading level, roughly ages 10-15 — everyday words in the clue itself, nothing that needs vocabulary a kid that age wouldn't have. Being clever doesn't require being wordy.
- Example: for PLATYPUS, "An egg-laying mammal with a duck bill" is too direct — prefer something like "Nature's idea of a practical joke."
- Example: for ICE CREAM, "A frozen treat you eat in a cone" is too direct — prefer something like "Gone in five minutes on a hot afternoon."
- Example: for LIGHTHOUSE, "A tower that warns ships" is too direct — prefer something like "Talks all night, only in one word."`;

/** One hangman word plus a clue. The clue is what makes a solo round
 * winnable — without it a 9-letter word off a category as broad as
 * "anything" is close to unguessable in six wrong letters.
 *
 * `avoid` is the last several words this player has already seen in this
 * category. Without it, both providers reliably converge on the same
 * "quirky but recognizable" answer for a narrow category — ask for Animals
 * enough times and PLATYPUS comes back again and again, because it's
 * sitting on the same high-probability token regardless of provider or
 * nominal randomness. An avoid list is the only thing that reliably breaks
 * that — asking the model to just "pick something different" doesn't,
 * because it has no memory of what it said last time without being told. */
export async function generateHangmanWord(
  providers: ModelProvider[],
  categoryLabel: string,
  avoid: string[] = []
): Promise<Generated<HangmanWord | null>> {
  const avoidLine = avoid.length
    ? `\n- Do NOT pick any of these — they've all been used recently: ${avoid.join(', ')}.`
    : '';

  const prompt = `Pick one word for a hangman game about "${categoryLabel}", for a family app.
Rules:
- If the category itself is clearly inappropriate, respond with exactly: {}
- The word must be a single word, letters A-Z only, between 5 and 10 letters.
- Common enough that a 13-year-old would know it, but not the single most obvious pick for the category.${avoidLine}
${CONTENT_RATING}
- Also give a clue, in two steps: "obvious" is the plain dictionary-style clue most people would write for it, and "hint" is a much better clue that shares nothing with the obvious one. See generateHangmanHint for why the boring version is asked for at all.
- The clue must be at most 8 words and must NOT contain the word itself or any part of it.
${VAGUE_CLUE_RULES}
- Respond with ONLY JSON: {"word":"EXAMPLE","obvious":"the boring clue","hint":"the good clue"}`;

  const avoidSet = new Set(avoid.map((word) => word.toUpperCase()));
  return generate<HangmanWord | null>(
    'generateHangmanWord',
    providers,
    prompt,
    (text) => {
      const json = firstJson(text, '{');
      if (!json) return null;
      let parsed: { word?: unknown; hint?: unknown; obvious?: unknown };
      try {
        parsed = JSON.parse(json);
      } catch {
        return null;
      }
      const word = String(parsed.word ?? '').trim().toUpperCase();
      if (!/^[A-Z]{5,10}$/.test(word)) return null;
      // The model doesn't always honor the avoid list — worth enforcing in
      // code rather than trusting the instruction alone, the same way the
      // trailing-S check backstops generateWordleWords below.
      if (avoidSet.has(word)) return null;
      const hint = String(parsed.hint ?? '').trim().slice(0, 80);
      const obvious = String(parsed.obvious ?? '').trim();
      // A clue containing the answer gives the round away, and so does one
      // the model admitted was the obvious clue by writing it twice. Drop
      // the clue in either case rather than the word, which is still
      // perfectly good — a round with no clue beats a round already solved.
      const tooEasy =
        hintGivesItAway(hint, word) ||
        (!!obvious && obvious.toLowerCase() === hint.toLowerCase());
      return { word, hint: tooEasy ? '' : hint };
    },
    (picked) => picked === null,
    null
  );
}

/** What the "suggest a clue" button gets back: a clue, and — since the
 * model is already looking at the word — whether it thinks the word is
 * misspelled. */
export interface HangmanClue {
  hint: string | null;
  correction: string | null;
}

/** A clue for a word someone else chose — the family game's "suggest a
 * clue" button. Unlike the solo generator this doesn't get to pick the
 * word, so it has to work with whatever it's handed, including a made-up
 * family in-joke it can make nothing of.
 *
 * It also answers the spelling question, because the alternative was two
 * calls that both do nothing but read the same short word. A setter who
 * taps Suggest has already paid for a model to look at their word; asking
 * it one more thing in the same breath costs a few output tokens, where a
 * second call costs another round trip and another provider attempt. The
 * standalone check (generateSpellingSuggestion below) stays for the setter
 * who writes their own clue and never taps Suggest at all. */
export async function generateHangmanHint(
  providers: ModelProvider[],
  word: string,
  category?: string
): Promise<Generated<HangmanClue | null>> {
  // Disambiguation only, never a hint to say out loud — a word chosen for
  // "Sports" still has to have its SPORTS sense clued (OVERTIME as an extra
  // period, not extra hours at work), but VAGUE_CLUE_RULES already (and
  // correctly) forbids naming the category in the clue text itself, so this
  // has to steer the model's pick of meaning without becoming something it
  // repeats back.
  const categoryLine = category
    ? `\nThis word was chosen for the category "${category}". If it has more than one common meaning, write the clue for the one that fits that category — but never name or hint at the category itself in the clue text; that's a separate rule below and still applies.`
    : '';
  // Asking for the obvious clue first is what actually moves the needle
  // here. Told only to "be vague", a model writes the dictionary definition
  // anyway — that phrasing is simply the likeliest continuation. Made to
  // write it down first and then deliberately write something else, it has
  // to move away from its own default, and the clue that comes back is the
  // second thought rather than the first. Costs nothing: one call either
  // way, and the obvious version is parsed out and thrown away.
  const prompt = `Write a clue for a game of hangman. The answer is "${word}".${categoryLine}
Work in three steps:
1. "correction": if "${word}" is a simple misspelling of one ordinary English word or phrase, the corrected spelling. Otherwise null. ${CORRECTION_RULES}
2. "obvious": the plain, boring, dictionary-style clue most people would write for the answer.
3. "clue": a much better clue that shares nothing with step 2 — a different angle entirely.
Rules:
- If you gave a correction, write the clue for the corrected spelling, not the typed one.
- The clue must be at most 8 words, playful, the kind of clue you'd give a family member.
- The clue must NOT contain the answer, any word of the answer, or any part of it spelled out.
${VAGUE_CLUE_RULES}
- If the answer is not a real word or phrase you recognize (it may be a name or an in-joke), respond with exactly: {}
${CONTENT_RATING}
- Respond with ONLY JSON: {"correction":null,"obvious":"the boring one","clue":"the good one"}`;

  return generate<HangmanClue | null>(
    'generateHangmanHint',
    providers,
    prompt,
    (text) => {
      const json = firstJson(text, '{');
      if (!json) return null;
      let parsed: { clue?: unknown; obvious?: unknown; correction?: unknown };
      try {
        parsed = JSON.parse(json);
      } catch {
        return null;
      }

      const correction = validCorrection(parsed.correction, word);
      // The clue was written for the corrected spelling, so that's what it
      // must not give away — "ELEPHANT never forgets" leaks the answer just
      // as badly when the setter typed ELEPHNT.
      const answer = correction ?? word;

      let hint: string | null = String(parsed.clue ?? '').trim().slice(0, 80);
      if (!hint || hintGivesItAway(hint, answer)) hint = null;
      // A model that ignored the two-step and wrote the same thing twice has
      // handed back exactly the clue this prompt exists to avoid.
      const obvious = String(parsed.obvious ?? '').trim();
      if (hint && obvious && obvious.toLowerCase() === hint.toLowerCase()) {
        hint = null;
      }

      return hint || correction ? { hint, correction } : null;
    },
    // Only a response with neither half is worth another provider. A word
    // that yielded a correction but no usable clue has been answered — the
    // setter gets their spelling question and writes their own clue.
    (clue) => clue === null,
    null
  );
}

/** Checks a word the setter typed, for the family game's "did you mean".
 *
 * The standalone version, for a setter who wrote their own clue and never
 * tapped Suggest — when they did tap it, generateHangmanHint above answered
 * this in the same call and this never runs.
 *
 * Returns null for "nothing to correct", which is also what every failure
 * degrades to: the setter's own spelling stands. */
export async function generateSpellingSuggestion(
  providers: ModelProvider[],
  word: string
): Promise<Generated<string | null>> {
  const prompt = `A player typed "${word}" as the answer for a game of hangman. Decide whether it is misspelled.
Rules:
${CORRECTION_RULES}
- Respond with ONLY JSON: {"correction":"CORRECTED"} or {"correction":null}`;

  return generate<string | null>(
    'generateSpellingSuggestion',
    providers,
    prompt,
    (text) => {
      const json = firstJson(text, '{');
      if (!json) return null;
      let parsed: { correction?: unknown };
      try {
        parsed = JSON.parse(json);
      } catch {
        return null;
      }
      return validCorrection(parsed.correction, word);
    },
    // A correct spelling and a failed call both come back null, so nothing
    // here is retryable — a second provider would only be a second opinion
    // on a question the first one answered.
    () => false,
    null
  );
}

/** What both prompts tell the model about correcting a spelling. Shared so
 * the answer doesn't depend on whether the setter happened to tap Suggest:
 * the same word must get the same verdict either way. */
const CORRECTION_RULES = `- If it is spelled correctly, the correction is null.
- If it is not an English word at all but could plausibly be a name, a place, a brand or a family nickname, the correction is null.
- Only correct it if you are confident it is a simple misspelling of one ordinary English word or phrase, and your correction is close to what was typed.
- Never replace it with a different word that merely sounds similar or means something similar.
- Keep the same number of words, uppercase, letters and single spaces only.`;

/** The code-side half of the same bargain.
 *
 * A hangman word is often a name, a pet, or a family in-joke, so the bar
 * for overruling the person who typed it is high. A "correction" that
 * rewrites the word into a different one is the failure the setter can't
 * sanity-check for themselves — they'd read "did you mean X?", think yes
 * that's the word I meant, and hand the guesser something else. So anything
 * more than a couple of edits away is thrown out here regardless of how
 * confident the model sounded. */
function validCorrection(raw: unknown, word: string): string | null {
  if (typeof raw !== 'string') return null;
  const fixed = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!/^[A-Z]+( [A-Z]+)*$/.test(fixed)) return null;
  if (fixed === word) return null;
  if (fixed.replace(/ /g, '').length > 18) return null;
  if (editDistance(fixed, word) > Math.min(3, Math.ceil(word.length / 4))) {
    return null;
  }
  return fixed;
}

/** Levenshtein distance, capped in practice by the 18-letter word limit. */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, i) => i);
  for (let i = 1; i < rows; i++) {
    const current = [i];
    for (let j = 1; j < cols; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[cols - 1];
}

// -------------------------------------------------------------- word bloom

export interface BloomPuzzle {
  /** The letters on the wheel, as one word that uses all of them. */
  base: string;
  /** Every word findable from those letters, the base included. */
  words: string[];
}

/** How thin a letter set has to be before it isn't worth playing. */
export const MIN_BLOOM_WORDS = 8;

/** True when `word` can be spelled from `base`'s letters, using each at most
 * as many times as it appears. This is the check that makes the whole
 * generator safe: a model asked for anagrams will confidently return words
 * using letters that aren't there, and every one of those would be a word
 * the player can see on the wheel but never enter. */
function spellableFrom(word: string, base: string): boolean {
  const available = new Map<string, number>();
  for (const letter of base) {
    available.set(letter, (available.get(letter) ?? 0) + 1);
  }
  for (const letter of word) {
    const left = available.get(letter) ?? 0;
    if (left === 0) return false;
    available.set(letter, left - 1);
  }
  return true;
}

/** Adds every vetted word the base can spell to a puzzle's answer list.
 *
 * A model asked for "every word hidden in these letters" reliably returns a
 * dozen and stops, which is what made a live puzzle feel broken to play:
 * the wheel plainly spells SNAKE, the player types SNAKE, and the game says
 * no. Sweeping the vocabulary closes that gap by construction — the served
 * list ends up as complete as the bundled packs, which are built the same
 * way, so the two halves of the game agree about what counts as a word.
 *
 * Also applied when reading a cached daily puzzle, so a day generated
 * before this existed still plays with the full list. */
export function expandBloomWords(base: string, words: string[]): string[] {
  const seen = new Set(words);
  const all = [...words];
  for (const word of BLOOM_VOCABULARY) {
    if (seen.has(word) || word.length > base.length) continue;
    if (!spellableFrom(word, base)) continue;
    seen.add(word);
    all.push(word);
  }
  return all.sort((a, b) => a.length - b.length || a.localeCompare(b));
}

/** A letter set and everything hidden in it.
 *
 * The model is doing the part it's good at — picking a base word and
 * recalling the short words inside it — and the letter check above throws
 * out the part it's bad at. Anything that survives is playable by
 * construction, so a sloppy response degrades into a smaller puzzle rather
 * than a broken one. */
export async function generateBloomPuzzle(
  providers: ModelProvider[],
  avoid: string[] = []
): Promise<Generated<BloomPuzzle | null>> {
  const avoidLine = avoid.length
    ? `\n- Do NOT use any of these base words — they've been used recently: ${avoid.join(', ')}.`
    : '';

  const prompt = `Pick one base word for a word puzzle, then list every shorter word hidden in its letters.
Rules:
- The base word must be a single common English word of 6 or 7 letters, letters A-Z only, no proper nouns.${avoidLine}
- Then list all the words of 3 or more letters that can be spelled using ONLY the letters of the base word, each letter used no more times than it appears in the base word.
- Include the base word itself in the list.
- Only include words a 13-year-old would know. No proper nouns, no abbreviations, no slang, no archaic words.
- Aim for at least 12 words in total.
${CONTENT_RATING}
- Respond with ONLY JSON: {"base":"GARDEN","words":["GARDEN","DANGER","GRADE","RANGE","READ","DEAR","RAN","AGE"]}`;

  const avoidSet = new Set(avoid.map((word) => word.toUpperCase()));
  return generate<BloomPuzzle | null>(
    'generateBloomPuzzle',
    providers,
    prompt,
    (text) => {
      const json = firstJson(text, '{');
      if (!json) return null;
      let parsed: { base?: unknown; words?: unknown };
      try {
        parsed = JSON.parse(json);
      } catch {
        return null;
      }

      const base = String(parsed.base ?? '').trim().toUpperCase();
      if (!/^[A-Z]{6,7}$/.test(base) || avoidSet.has(base)) return null;
      if (!Array.isArray(parsed.words)) return null;

      const seen = new Set<string>();
      const words: string[] = [];
      for (const raw of parsed.words) {
        if (typeof raw !== 'string') continue;
        const word = raw.trim().toUpperCase();
        if (!/^[A-Z]{3,7}$/.test(word) || seen.has(word)) continue;
        if (word.length > base.length) continue;
        if (!spellableFrom(word, base)) continue;
        seen.add(word);
        words.push(word);
      }
      // The base has to be findable, or the puzzle has no final answer.
      if (!seen.has(base)) return null;

      const full = expandBloomWords(base, words);
      return full.length < MIN_BLOOM_WORDS ? null : { base, words: full };
    },
    (puzzle) => puzzle === null,
    null
  );
}

// ------------------------------------------------------------ mini crossword

export interface CrosswordEntry {
  /** 'across' | 'down', the row/col it starts on, the answer and its clue. */
  direction: 'across' | 'down';
  row: number;
  col: number;
  answer: string;
  clue: string;
}

export interface MiniCrossword {
  /** Five rows of five characters: A-Z for a letter, '#' for a block. */
  grid: string[];
  entries: CrosswordEntry[];
}

export const CROSSWORD_SIZE = 5;

/** The block pattern every generated mini uses, '#' being a block.
 *
 * Fixed rather than left to the model for two reasons: a free-form pattern
 * is one more thing to validate, and pinning it means the prompt can name
 * the exact runs to fill, which is the difference between a model that
 * sometimes solves this and one that never does. Blocking two corners drops
 * the hardest four crossings and turns an almost-impossible double word
 * square into something a thinking model lands regularly. */
const CROSSWORD_PATTERN = [
  '...##',
  '.....',
  '.....',
  '.....',
  '##...',
];

interface Slot {
  direction: 'across' | 'down';
  row: number;
  col: number;
  length: number;
}

/** Every run of 3 or more open squares in the fixed pattern — the slots an
 * answer has to fill, derived from the pattern rather than restated, so the
 * two can't drift apart. */
function crosswordSlots(): Slot[] {
  const slots: Slot[] = [];
  const open = (r: number, c: number) =>
    r >= 0 &&
    r < CROSSWORD_SIZE &&
    c >= 0 &&
    c < CROSSWORD_SIZE &&
    CROSSWORD_PATTERN[r][c] !== '#';

  for (let r = 0; r < CROSSWORD_SIZE; r++) {
    for (let c = 0; c < CROSSWORD_SIZE; c++) {
      if (!open(r, c)) continue;
      if (!open(r, c - 1)) {
        let length = 0;
        while (open(r, c + length)) length++;
        if (length >= 3) slots.push({ direction: 'across', row: r, col: c, length });
      }
      if (!open(r - 1, c)) {
        let length = 0;
        while (open(r + length, c)) length++;
        if (length >= 3) slots.push({ direction: 'down', row: r, col: c, length });
      }
    }
  }
  return slots;
}

export const CROSSWORD_SLOTS = crosswordSlots();

function describeSlots(): string {
  return CROSSWORD_SLOTS.map(
    (slot) =>
      `- ${slot.direction} starting row ${slot.row}, column ${slot.col}: ${slot.length} letters`
  ).join('\n');
}

/** Reads the answer a filled grid actually contains for one slot. */
function readSlot(grid: string[], slot: Slot): string {
  let word = '';
  for (let i = 0; i < slot.length; i++) {
    word +=
      slot.direction === 'across'
        ? grid[slot.row][slot.col + i]
        : grid[slot.row + i][slot.col];
  }
  return word;
}

/** A filled 5x5 mini with clues.
 *
 * This is the strictest validator in the file, and it has to be: a
 * crossword that looks right but whose third down entry isn't a word is
 * worse than no crossword, because the player can't tell whether they're
 * stuck or the puzzle is wrong. Everything is checked against the grid
 * itself — the claimed answers only count if the grid actually spells them,
 * the blocks have to sit exactly where the pattern says, and every slot
 * needs its own clue. Anything short of all of that is rejected and the
 * next provider gets a turn. */
export async function generateMiniCrossword(
  providers: ModelProvider[],
  avoid: string[] = []
): Promise<Generated<MiniCrossword | null>> {
  const avoidLine = avoid.length
    ? `\n- Try not to reuse these answers from recent puzzles: ${avoid.slice(0, 20).join(', ')}.`
    : '';

  const prompt = `Build a 5x5 mini crossword.

The grid is 5 rows of 5 characters. Two corners are blocked and MUST be exactly these squares, written as '#':
${CROSSWORD_PATTERN.join('\n')}

So the answers to fill are:
${describeSlots()}

Rules:
- Every one of those runs must be a real, common English word, reading left-to-right or top-to-bottom.
- Crossing letters must agree — this is a real crossword, every letter is shared by one across answer and one down answer.
- Only common words a 13-year-old would know. No proper nouns, no abbreviations, no obscure words.${avoidLine}
- Give every answer a short, clear clue of at most 8 words. The clue must not contain the answer.
${CONTENT_RATING}
- Check your grid before answering: read each run out of the grid you wrote and confirm it spells the answer you listed.
- Respond with ONLY JSON, the grid as 5 strings of 5 characters:
{"grid":["CAT##","ABIDE","RIVER","EDGES","##TRY"],"entries":[{"direction":"across","row":0,"col":0,"answer":"CAT","clue":"Purring pet"}]}`;

  return generate<MiniCrossword | null>(
    'generateMiniCrossword',
    providers,
    prompt,
    (text) => {
      const json = firstJson(text, '{');
      if (!json) return null;
      let parsed: { grid?: unknown; entries?: unknown };
      try {
        parsed = JSON.parse(json);
      } catch {
        return null;
      }

      // --- the grid itself
      if (!Array.isArray(parsed.grid) || parsed.grid.length !== CROSSWORD_SIZE) {
        return null;
      }
      const grid: string[] = [];
      for (const raw of parsed.grid) {
        if (typeof raw !== 'string') return null;
        const row = raw.trim().toUpperCase();
        if (!/^[A-Z#]{5}$/.test(row)) return null;
        grid.push(row);
      }
      // Blocks exactly where the pattern says, and nowhere else.
      for (let r = 0; r < CROSSWORD_SIZE; r++) {
        for (let c = 0; c < CROSSWORD_SIZE; c++) {
          const shouldBlock = CROSSWORD_PATTERN[r][c] === '#';
          if (shouldBlock !== (grid[r][c] === '#')) return null;
        }
      }

      // --- the clues, matched to slots by position and direction
      if (!Array.isArray(parsed.entries)) return null;
      const clues = new Map<string, string>();
      for (const raw of parsed.entries) {
        if (!raw || typeof raw !== 'object') continue;
        const entry = raw as Record<string, unknown>;
        const direction = String(entry.direction ?? '').trim().toLowerCase();
        if (direction !== 'across' && direction !== 'down') continue;
        const row = Number(entry.row);
        const col = Number(entry.col);
        if (!Number.isInteger(row) || !Number.isInteger(col)) continue;
        const clue = String(entry.clue ?? '').trim().slice(0, 80);
        if (!clue) continue;
        clues.set(`${direction}:${row}:${col}`, clue);
      }

      const entries: CrosswordEntry[] = [];
      for (const slot of CROSSWORD_SLOTS) {
        const answer = readSlot(grid, slot);
        if (!/^[A-Z]+$/.test(answer)) return null;
        const clue = clues.get(`${slot.direction}:${slot.row}:${slot.col}`);
        if (!clue) return null;
        // A clue containing its own answer gives the square away.
        if (clue.toUpperCase().includes(answer)) return null;
        entries.push({
          direction: slot.direction,
          row: slot.row,
          col: slot.col,
          answer,
          clue,
        });
      }

      return { grid, entries };
    },
    (puzzle) => puzzle === null,
    null,
    // One attempt each: this chain is Gemini then Sonnet, and a model that
    // can't fill the grid usually can't fill it on the retry either. The
    // player is waiting on this one, so spend the time on the next model
    // rather than the same one again.
    1
  );
}

// ---------------------------------------------------------------- parsing

/** A clue must not contain the answer. Checked word by word, because the
 * answer may be a phrase and "ICE" leaking is as fatal as "ICE CREAM". Very
 * short words are skipped — a two-letter fragment matches far too much
 * ordinary English to be a useful signal. */
function hintGivesItAway(hint: string, word: string): boolean {
  const upper = hint.toUpperCase();
  return word
    .split(' ')
    .some((part) => part.length > 2 && upper.includes(part));
}

/** Shared parser for the two "give me a list of words" prompts: pull the
 * array out, keep the strings matching `shape`, drop duplicates. */
function parseWordList(text: string, shape: RegExp, limit: number): string[] {
  const json = firstJson(text, '[');
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of parsed) {
    if (typeof raw !== 'string') continue;
    const word = raw.trim().toUpperCase();
    if (!shape.test(word) || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
    if (words.length >= limit) break;
  }
  return words;
}
