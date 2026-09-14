import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';

/** The model plumbing shared by every word generator.
 *
 * The games don't care which model writes their words — they care that a
 * word arrives. So everything model-specific is confined to this file: a
 * provider takes a prompt and returns text, and that's the whole contract.
 * The prompts, the parsing and the validation live with the games, which
 * means adding a provider costs one function here and nothing anywhere
 * else.
 *
 * Gemini is tried first because it's free at this family's volume. Claude
 * Haiku backs it up: Gemini returns transient 503s often enough to matter,
 * and without a second provider those turn into a canned word for everyone
 * (or, for the word search, a dead end the player can see). */

// A stable alias (not a pinned version) so this doesn't silently 404 again
// the next time Google retires a dated model — it always resolves to
// whatever flash-lite model is currently recommended.
//
// Deliberately -lite, not the flagship flash alias. Measured directly
// against this project's own key: the flagship model's free tier is
// 20 requests/day, shared across every AI feature in the app — a single
// family evening burns through that in minutes, which is why Haiku ended
// up serving nearly every request. Flash-Lite's free tier runs roughly
// 25x more requests/day, at a real but small quality cost that doesn't
// matter for what this app asks of it: short, constrained JSON —
// a word list, a word-and-clue pair, a one-line hint. None of that leans
// on the reasoning depth flash-lite trades away. Live-tested against all
// four of this app's prompts (word search topics, Wordle answers, hangman
// words, hangman hints) before switching; results were as good as the
// flagship model's on the same prompts.
const GEMINI_MODEL = 'gemini-flash-lite-latest';
const HAIKU_MODEL = 'claude-haiku-4-5';

// Belt-and-suspenders for a kids' feature, backed by the API's own
// content-safety filters — so a refusal doesn't depend on the model
// reliably following the prompt alone.
//
// This started at BLOCK_LOW_AND_ABOVE, then BLOCK_MEDIUM_AND_ABOVE, and both
// still over-blocked completely benign kid topics: "Disney Parks" (probably
// "haunted" from the Haunted Mansion) and "Disney Princesses" (probably
// "poison" from Snow White, or "curse"/"spell") got silently zeroed out
// because ONE flagged word anywhere in the response kills the whole
// response, not just that word. The prompts carry their own instruction to
// refuse an unsuitable topic outright, so this only needs to catch what the
// model itself didn't already refuse.
//
// Note this knob is Gemini-specific — Anthropic exposes no equivalent. The
// prompt-level rating (CONTENT_RATING below) is the layer both providers
// share, which is why it carries the real weight.
const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({
  category,
  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
}));

/** The appropriateness bar for every word game, stated once so the prompts
 * can't drift apart — and so it applies identically whichever provider
 * ends up answering. Roughly PG-13: this is a family app, but the players
 * aren't toddlers, and over-tightening it is what made the word search
 * silently refuse things like "Disney Princesses". */
export const CONTENT_RATING = `- This is a family app. Aim for roughly a PG-13 standard: ordinary, mildly edgy or spooky vocabulary is fine, but nothing sexual, hateful, graphic, slurs, or drug-related.`;

/** One model behind one method. Never throws: a provider that fails returns
 * an empty string and logs why, because every caller's answer to "this one
 * didn't work" is the same — try the next one. */
export interface ModelProvider {
  name: string;
  complete(prompt: string): Promise<string>;
}

export function geminiProvider(apiKey: string): ModelProvider {
  const ai = new GoogleGenAI({ apiKey });
  return {
    name: 'gemini',
    async complete(prompt) {
      try {
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: { safetySettings: SAFETY_SETTINGS },
        });
        const text = response.text ?? '';
        if (!text) {
          console.warn('gemini: empty response', {
            finishReason: response.candidates?.[0]?.finishReason,
          });
        }
        return text;
      } catch (err) {
        console.error('gemini: request failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        return '';
      }
    },
  };
}

export function haikuProvider(apiKey: string): ModelProvider {
  const client = new Anthropic({ apiKey });
  return {
    name: 'haiku',
    async complete(prompt) {
      try {
        const response = await client.messages.create({
          model: HAIKU_MODEL,
          // Every prompt here asks for a short JSON array or object; 1024 is
          // far more than any of them needs and keeps the call well inside
          // the function's own timeout.
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        });
        // content is a discriminated union — narrow before reading .text.
        return response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('');
      } catch (err) {
        // Most specific first: a bad key or a blown quota is worth calling
        // out distinctly, because retrying either is pointless.
        if (err instanceof Anthropic.AuthenticationError) {
          console.error('haiku: ANTHROPIC_API_KEY rejected');
        } else if (err instanceof Anthropic.RateLimitError) {
          console.warn('haiku: rate limited');
        } else if (err instanceof Anthropic.APIError) {
          console.error('haiku: request failed', {
            status: err.status,
            message: err.message,
          });
        } else {
          console.error('haiku: request failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return '';
      }
    },
  };
}

/** The provider chain, in preference order. A missing key drops that
 * provider rather than failing — so the functions still deploy and run with
 * only one of the two secrets configured. */
export function providersFrom(
  geminiApiKey: string,
  anthropicApiKey: string
): ModelProvider[] {
  const providers: ModelProvider[] = [];
  if (geminiApiKey) providers.push(geminiProvider(geminiApiKey));
  if (anthropicApiKey) providers.push(haikuProvider(anthropicApiKey));
  if (providers.length === 0) console.error('no model provider is configured');
  return providers;
}

/** Which provider actually produced a result — surfaced all the way to the
 * player as a small badge, since "the AI" covers two very different models
 * behind one button and it's been worth knowing which one answered while
 * this is new. `null` means the whole chain came up empty; the caller
 * substitutes its own bundled fallback and labels it as such. */
export type ProviderSource = 'gemini' | 'haiku';

export interface Generated<T> {
  value: T;
  source: ProviderSource | null;
}

/** Runs a prompt down the provider chain until something parses.
 *
 * Each provider gets `attempts` tries with a short backoff before we move
 * on, because the failure this most often rides out is a transient 503
 * "high demand" — retrying instantly tends to land in the same spike.
 * "Failed" and "came back with nothing usable" are deliberately the same
 * case: a blocked response and a malformed one are equally useless, and
 * both are worth another try.
 *
 * Returns the empty value (with a null source) if the whole chain comes up
 * short; callers decide whether that means a bundled fallback or an error
 * the player sees. */
export async function generate<T>(
  label: string,
  providers: ModelProvider[],
  prompt: string,
  parse: (text: string) => T,
  isEmpty: (value: T) => boolean,
  empty: T,
  attempts = 2
): Promise<Generated<T>> {
  for (const provider of providers) {
    for (let n = 1; n <= attempts; n++) {
      if (n > 1) {
        await new Promise((resolve) => setTimeout(resolve, 400 * n));
      }
      const text = await provider.complete(prompt);
      if (text) {
        const parsed = parse(text);
        if (!isEmpty(parsed)) {
          if (provider.name !== providers[0].name || n > 1) {
            // Worth a log line: a family word served by the backup, or on a
            // retry, is the signal that the primary is struggling.
            console.info(`${label}: served by ${provider.name} on attempt ${n}`);
          }
          return { value: parsed, source: provider.name as ProviderSource };
        }
      }
      console.warn(`${label}: ${provider.name} attempt ${n} came back empty`);
    }
  }
  console.error(`${label}: every provider came up empty`);
  return { value: empty, source: null };
}

/** Pulls the first JSON array or object out of a model response, which
 * tends to arrive wrapped in prose or a code fence however firmly the
 * prompt says otherwise. */
export function firstJson(text: string, opener: '[' | '{'): string | null {
  const match = text.match(opener === '[' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/);
  return match ? match[0] : null;
}
