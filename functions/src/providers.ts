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
// whatever flagship Flash model is currently recommended.
//
// Upgraded from -lite back to the flagship alias now that the word-bank
// rebuild has landed: -lite was chosen when every single play was a live
// call and the flagship's 20-requests/day free tier would have been blown
// through in one family evening. Under the bank system a live call only
// happens on bootstrap or refill — a handful a week at most — which the
// flagship's tighter limit comfortably covers, and it's the better model.
// If Gemini's free tier ever does get exhausted, OpenRouter picks up the
// very next request rather than the player seeing a failure.
const GEMINI_MODEL = 'gemini-flash-latest';
const HAIKU_MODEL = 'claude-haiku-4-5';
// Only the mini crossword reaches for this one. Filling a 5x5 grid where
// every across and down run has to be a real word is a constraint-solving
// problem, not a "write me a list" problem, and the two cheap models fail
// it far more often than they succeed. Sonnet runs adaptive thinking when
// no `thinking` parameter is sent, which is exactly what this needs.
//
// Slated for removal once the crossword moves to a local constraint solver
// (see WORD_BANK_PLAN.md §3) — every reasoning model tested against the
// live grid-fill task truncated to zero output, up to $0.05/failed call,
// which is the real argument for that rebuild, not just cost.
const SONNET_MODEL = 'claude-sonnet-5';

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

/** The reasoning-grade provider, for the one generator whose output has to
 * satisfy hard constraints rather than just read well.
 *
 * Streamed rather than awaited in one shot: with adaptive thinking on, a
 * hard grid can take long enough to bump the callable's own timeout, and a
 * stream keeps the connection alive while it works. */
export function sonnetProvider(apiKey: string): ModelProvider {
  const client = new Anthropic({ apiKey });
  return {
    name: 'sonnet',
    async complete(prompt) {
      try {
        // No `thinking` parameter on purpose: Sonnet runs adaptive thinking
        // when none is given, and the fixed budget_tokens form this model
        // would otherwise want is rejected outright.
        const response = await client.messages
          .stream({
            model: SONNET_MODEL,
            max_tokens: 8192,
            messages: [{ role: 'user', content: prompt }],
          })
          .finalMessage();
        return response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('');
      } catch (err) {
        if (err instanceof Anthropic.AuthenticationError) {
          console.error('sonnet: ANTHROPIC_API_KEY rejected');
        } else if (err instanceof Anthropic.RateLimitError) {
          console.warn('sonnet: rate limited');
        } else if (err instanceof Anthropic.APIError) {
          console.error('sonnet: request failed', {
            status: err.status,
            message: err.message,
          });
        } else {
          console.error('sonnet: request failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return '';
      }
    },
  };
}

// Backs up Gemini for every generator except the crossword. Chosen over
// Haiku as the *first* fallback because it's the one actually measured
// against these exact prompts (word list, Wordle answers, hangman word +
// clue) — reliable and a fraction of Haiku's per-call cost. Haiku stays in
// the chain behind it: a second, differently-run provider is worth having
// on the rare day both Gemini and OpenRouter itself are unreachable, and
// it's already paid for.
const OPENROUTER_FLASH_MODEL = 'z-ai/glm-5.3-flash';

/** The provider chain, in preference order: Gemini (free), then GLM Flash
 * via OpenRouter (cheap, measured), then Haiku (on the direct Anthropic
 * key — deliberately not routed through OpenRouter, so this app never
 * depends on OpenRouter being up to reach Anthropic at all). A missing key
 * drops that provider rather than failing, so the functions still deploy
 * and run with only some of the three configured. */
export function providersFrom(
  geminiApiKey: string,
  openRouterApiKey: string,
  anthropicApiKey: string
): ModelProvider[] {
  const providers: ModelProvider[] = [];
  if (geminiApiKey) providers.push(geminiProvider(geminiApiKey));
  if (openRouterApiKey) {
    providers.push(openRouterProvider(openRouterApiKey, OPENROUTER_FLASH_MODEL, { name: 'glm-flash' }));
  }
  if (anthropicApiKey) providers.push(haikuProvider(anthropicApiKey));
  if (providers.length === 0) console.error('no model provider is configured');
  return providers;
}

/** Gemini, then Sonnet — the chain for the mini crossword only.
 *
 * Haiku is deliberately skipped here, which is the one place it isn't the
 * second choice. Filling a grid is pass/fail against the validator rather
 * than a matter of quality, and Haiku almost never passes it; leaving it in
 * would mostly buy two more slow attempts before the model that can
 * actually do it gets a turn. Gemini is still first because it's free and
 * does sometimes land it, and the bundled puzzles catch the day neither
 * manages. */
export function deepProvidersFrom(
  geminiApiKey: string,
  anthropicApiKey: string
): ModelProvider[] {
  const providers: ModelProvider[] = [];
  if (geminiApiKey) providers.push(geminiProvider(geminiApiKey));
  if (anthropicApiKey) providers.push(sonnetProvider(anthropicApiKey));
  if (providers.length === 0) console.error('no model provider is configured');
  return providers;
}

/** Which provider actually produced a result — surfaced all the way to the
 * player as a small badge, since "the AI" covers two very different models
 * behind one button and it's been worth knowing which one answered while
 * this is new. `null` means the whole chain came up empty; the caller
 * substitutes its own bundled fallback and labels it as such. */
export type ProviderSource = 'gemini' | 'glm-flash' | 'haiku' | 'sonnet';

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

// ---------------------------------------------------------- openrouter

/** OpenRouter reaches every vendor behind one key and one wire format, so
 * a model swap is a string change here rather than a new SDK, new auth and
 * new error handling in a new function.
 *
 * Deliberately plain `fetch` rather than the OpenAI SDK: the whole contract
 * is one POST returning one string, Node 20 has fetch built in, and a
 * dependency that exists to save twenty lines is a dependency that still
 * has to be patched. */
export function openRouterProvider(
  apiKey: string,
  model: string,
  options: { name?: string; maxTokens?: number; reasoning?: 'low' | 'medium' | 'high' } = {}
): ModelProvider {
  // Always sent, never left to the model's default. The strong open-weight
  // models are all reasoning models now, their reasoning tokens bill as
  // output, and — the part that actually bites — they count against
  // max_tokens. Left uncapped, GLM-5.3 spent all 1024 tokens thinking about
  // a 20-word list and returned finish_reason=length with an empty string:
  // a full-price call that parses as a failure. 'low' is the default
  // because three of the four generators here are recall, not reasoning.
  // The crossword asks for 'high' explicitly, which is the one place the
  // thinking is the whole point.
  const effort = options.reasoning ?? 'low';
  return {
    name: options.name ?? 'openrouter',
    async complete(prompt) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            // Attribution headers. Not required, but they're what makes the
            // OpenRouter activity page readable per-app instead of one
            // undifferentiated pile of requests.
            'HTTP-Referer': 'https://family-hub.web.app',
            'X-Title': 'Family Hub',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            // Headroom over the 1024 the Anthropic providers use: even at
            // 'low' effort a reasoning model spends some of this budget
            // before it writes anything, and running out mid-JSON is
            // indistinguishable from a refusal by the time it reaches the
            // parser.
            max_tokens: options.maxTokens ?? 2048,
            // Enforced per-request, not just in the account settings, so a
            // setting flipped in the dashboard later can't quietly opt this
            // app's traffic into a provider that trains on it. Costs an
            // occasional routing option; worth it for a kids' app.
            provider: { data_collection: 'deny' },
            reasoning: { effort },
          }),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          console.error(`${options.name ?? 'openrouter'}: request failed`, {
            status: response.status,
            model,
            detail: detail.slice(0, 300),
          });
          return '';
        }

        const body = (await response.json()) as {
          choices?: { message?: { content?: string }; finish_reason?: string }[];
          error?: { message?: string };
        };
        // OpenRouter can return HTTP 200 with an error body when a
        // downstream provider fails mid-route, so a status check alone
        // isn't enough to call this a success.
        if (body.error) {
          console.error(`${options.name ?? 'openrouter'}: provider error`, {
            model,
            message: body.error.message,
          });
          return '';
        }
        const choice = body.choices?.[0];
        const content = choice?.message?.content ?? '';
        // Worth its own line: an empty response and a response that ran out
        // of room are the same empty string to the caller, but they need
        // opposite fixes — one is a refusal to retry past, the other is a
        // budget to raise.
        if (!content && choice?.finish_reason === 'length') {
          console.warn(`${options.name ?? 'openrouter'}: truncated before any content`, {
            model,
            effort,
            maxTokens: options.maxTokens ?? 2048,
          });
        }
        return content;
      } catch (err) {
        console.error(`${options.name ?? 'openrouter'}: request failed`, {
          model,
          error: err instanceof Error ? err.message : String(err),
        });
        return '';
      }
    },
  };
}
