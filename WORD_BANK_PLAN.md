# Word bank + model chain rebuild — execution plan

Written at the end of a long design conversation on 2026-09-19, for a fresh
session (likely Opus, after today's usage cap resets) to execute without
that conversation's context. Everything below reflects decisions actually
made and, where noted, actually measured — not proposals still open for
debate. Sections marked **OPEN** are the real remaining decisions.

## Status as of 2026-09-19 (this evening's session)

§1, §2, and the first two integrations from §3 are **built, typechecked,
built (`npm run build`), and committed** — not just designed. Check `git
log` for the exact commits (search for "Add an OpenRouter provider",
"three-tier model chain", "shared word-pool schema", "Seed word search's
topic vocabulary", "Migrate solo Hangman"). Specifically done:

- The `openRouterProvider()` fix (explicit `reasoning.effort`, 2048
  `max_tokens`) is committed, not just sitting in the working tree.
- `providersFrom()` is the three-tier chain: Gemini (`gemini-flash-latest`,
  upgraded from `-lite`, verified against the installed `@google/genai`
  SDK's own type definitions rather than guessed) → GLM Flash via
  OpenRouter → Haiku on the direct Anthropic key.
- `functions/src/wordBank.ts` exists with `seedPool`, `fetchWords`,
  `markUsed`, `enrichPoolWord` — the full §2 design, working code, not
  pseudocode.
- `wordPool`/`wordUsage` Firestore rules added (deny-all, matching
  `dailyWords`/`crosswords`/`bloomPuzzles`).
- `generateWordSearchPuzzle` seeds its full candidate word list into the
  pool (§3's word search integration).
- `getHangmanWord` fully migrated onto `fetchWords`/`markUsed`, with lazy
  clue enrichment via `enrichPoolWord`. This is the reference
  implementation for migrating Bloom and Wordle next — read it before
  reinventing the pattern.
- A new `'pool'` provider-source value was added (client-side only —
  `ProviderBadge`, `firestoreHangman.ts`'s `HangmanWord` — NOT to
  `providers.ts`'s `ProviderSource`, which correctly stays scoped to "which
  model answered a live `generate()` call"; `'pool'` means no model was
  called this request at all, which needed its own honest label rather
  than inheriting whichever provider answered a much earlier bootstrap).

**Also done, later the same evening:**
- Multiplayer hangman's suggestion-picker backend: `suggestHangmanWords`
  (browse-only, no side effects) and `markHangmanSuggestionUsed` (the real
  commit step) — both additive, both using the existing `fetchWords()` API
  unchanged. Client helpers `fetchHangmanSuggestions`/
  `markHangmanSuggestionUsed` added to `firestoreHangman.ts`. **The UI is
  not built** — `HangmanOnline.tsx`'s `WordSetter` component still only
  offers "write from scratch." Wiring a mode toggle + suggestion list +
  load-more button into that component is the next step for this feature,
  and the backend it needs already exists and works.
- Investigated Bloom's migration and deliberately did NOT force it into
  `wordBank.ts`'s existing `PoolWord` shape — see the new note in §3's Word
  Bloom section below. This was a real finding, not a skip: Bloom needs a
  different pool document shape entirely.
- A Haiku subagent was mid-run testing `wordBank.ts` against the Firestore
  emulator when this note was written — check for a `functions/testWordBank.js`
  scratch file and this doc's own git history / the conversation for its
  findings before assuming `wordBank.ts` is unverified. It may have found
  and fixed small bugs; check `git diff` / `git log` on `wordBank.ts` for
  anything after commit `4298649`.

**Also done, later still:**
- Split `providersFrom` into two chains: it was Gemini-first for
  everything, which was wrong — Gemini's tighter free tier should be
  reserved for calls that fill something durable (the pool, a cached clue,
  a shared daily doc), not one-off calls like a clue suggestion or spelling
  check. New `routineProvidersFrom` (GLM Flash → Haiku, no Gemini) now
  serves `getHangmanHint` and `checkHangmanWord`.
- Migrated Wordle (both daily and free play) onto the pool — the gap the
  user caught after the fact, not something I volunteered proactively.
  Added an optional `BootstrapOverrides` hook to `wordBank.ts` for Wordle's
  quality rules (no plurals, no proper nouns) that the generic shape filter
  can't express. `getWordleWords` deliberately uses `models()` (Gemini
  chain), not `routineProvidersFrom` — once it's pool-backed, its bootstrap
  fills the same durable pool the daily word reads too.
- Deployed functions AND hosting for real, to the live project
  (`rickenback-hub`) — this was tested live, not just typechecked, per the
  user's explicit choice after the local emulator turned out to need Java
  21+ (not installed on this machine).

**Not done — pick up here:**
- §3's multiplayer hangman suggestion feature's UI (backend is done, see
  above).
- §3's Bloom migration onto the pool. Needs design work first, not just
  implementation — see below.
- §4's category-discovery UI.
- §3.6's crossword rebuild (local CSP solver + filler bank + clue-writing
  call) — entirely unbuilt. The algorithm and bank-sizing numbers are
  documented in §3.6 from real measurements, but no code for it exists in
  the repo yet; it only ever ran in this session's scratchpad.
- `sonnetProvider`/`deepProvidersFrom` and `getMiniCrossword`'s
  `timeoutSeconds: 180` are still in place, deliberately — removing them
  before the crossword rebuild replaces their caller would break the
  crossword entirely. Don't touch them until §3.6 ships.
- Manual/integration testing: none of this has been run against a real
  Firebase emulator or deployed project this session, only `tsc --noEmit`
  and `npm run build`. Test `generateWordSearchPuzzle` and `getHangmanWord`
  for real before assuming they work end-to-end.

## 0. What triggered this

Started as "should we use OpenRouter for cheaper models." Turned into: (a) a
real bug found and fixed in how reasoning-model token budgets work on
OpenRouter, (b) a redesign of the mini crossword away from asking a model to
solve a constraint problem it's bad at, and (c) a much bigger redesign: every
AI-picked word in this app (hangman, wordle, bloom) currently comes from a
live, stateless model call with only a short in-memory avoid-list guarding
against repeats — and that repeat problem is real and was measured, not
assumed.

## 1. Model chain (functions/src/providers.ts)

**Current state:** Gemini (`gemini-flash-lite-latest`, free) → Claude Haiku
(`claude-haiku-4-5`, direct Anthropic key) → for crossword only, Sonnet
instead of Haiku. An `openRouterProvider()` function was added this session
(plain `fetch`, no new SDK) but nothing calls it yet.

**Target state**, three tiers, in order:

1. **Gemini — upgrade to the flagship Flash alias, not `-lite`.** The
   existing code comment explains why `-lite` was chosen: the flagship's
   free tier is only 20 requests/day per the doc comment at
   [providers.ts:23](functions/src/providers.ts#L23), vs `-lite`'s ~25x
   higher cap, and at the time every single play was a live call, so volume
   mattered. That's no longer true — see §2. Under the pool architecture,
   live calls happen only on bootstrap/refill, which will be rare (a
   handful a week at most, once pools exist for the family's regular
   categories). 20/day comfortably covers that, and the flagship model is
   higher quality. **Verify the exact alias string** against
   `@google/genai`'s current supported models before hardcoding — the
   existing code deliberately uses `-latest` suffixes to avoid pinning a
   dated model that 404s later; keep that pattern (likely
   `gemini-flash-latest`, confirm don't guess).
2. **GLM-5.3-Flash via OpenRouter, as first backup.** Model id
   `z-ai/glm-5.3-flash`. Validated this session against the real prompts and
   real validators for `generateTopicWords`, `generateWordleWords`,
   `generateHangmanWord` — all passed reliably (see §6 for numbers). This
   replaces Haiku as the *first* fallback because it's the one actually
   tested this session on these exact prompt shapes, and costs a fraction of
   a cent per call.
3. **Claude Haiku, as second/last backup — keep on the direct Anthropic
   key, NOT through OpenRouter.** This was an explicit choice: don't route
   Haiku through OpenRouter. Use the existing `ANTHROPIC_API_KEY` secret and
   `haikuProvider()` unchanged. Anthropic isn't being dropped from the
   project, just demoted to "belt and suspenders behind two other
   providers."

**Required change to `openRouterProvider()`:** always send an explicit
`reasoning: { effort }` (default `'low'`), and use `max_tokens: 2048` by
default, not `1024`. This is a real bug found and already fixed in
[providers.ts](functions/src/providers.ts) this session — reasoning models
on OpenRouter bill *and count* reasoning tokens against `max_tokens`, so an
uncapped high-effort call can exhaust its whole budget thinking and return
`finish_reason: 'length'` with an empty string, which looks exactly like a
refusal to the caller. Confirm this fix is still in place before building
further on top of it. **Checked at the time this plan was written: it is
NOT committed** — `git status` shows `functions/src/providers.ts` modified
in the working tree only (107 lines added, the `openRouterProvider()`
function plus the effort/token-budget fix), nothing else touched. This
plan's own `WORD_BANK_PLAN.md` is untracked too. Review the diff with `git
diff functions/src/providers.ts` before building on it — don't assume it
matches what's described here without checking, since more may have
changed between writing this plan and it being read.

**Crossword's `deepProvidersFrom` / Sonnet path:** no longer needed at all
once §5's redesign lands — the crossword no longer asks any model to fill
the grid, so there's no task left in the app that needs a
higher-reasoning-effort model. `sonnetProvider` and `deepProvidersFrom` can
be deleted once the crossword rebuild ships. Don't delete them first; the
crossword rebuild is what makes them dead code.

## 2. The core idea: shared word pools, not live-per-play calls

**The problem, measured directly this session:** asked "Animals" repeatedly
with only a short avoid-list (today's actual production behavior, mirrored
exactly and run for real), GLM-5.3-Flash repeated a word within 9 rounds
(PENGUIN, having aged out of an 8-word window) — an 8% repeat rate over 13
trials. This is the exact failure the existing code comment on
`generateHangmanWord` already names ("looking at you, PLATYPUS") and it's
real, not theoretical. The same convergence problem affects Bloom (observed
live: "giving me the same results each time") and Wordle's free-play batch,
which currently has no avoid-list at all.

**A tested-and-rejected alternative, for the record:** seeding the prompt
with two random "anchor" words from a category and asking for something
"similar but not these" was tried this session as a possible fix. It made
things *worse* — 33-36% repeat rate across 15 trials, because the model's
underlying attractor (e.g. "animal with a surprising trait") survives the
anchor words changing; OCTOPUS came back three times from three completely
different seed pairs. **Do not build the seed-pair approach.** The fix is
architectural, not a smarter prompt.

**The actual fix:** stop calling the model live per play. Maintain a shared,
persistent word pool per topic, draw from it deterministically, and only
call a model when the pool needs topping up. This makes a repeat
structurally impossible until the whole pool has been shown once — not just
improbable.

### Schema

Two Firestore collections, deliberately separate:

- **`wordPool/{topicSlug}`** — the shared vocabulary. `{ words: [{ word,
  hint?, obvious?, addedAt, addedBy: 'wordsearch'|'bootstrap' }], topic,
  createdAt }`. Words are never removed. Grows over time from multiple
  producers (see §3).
- **`wordUsage/{game}-{topicSlug}`** — **per game**, tracks what that
  specific game has already served to the family. `{ used: string[] }`.

**Why two collections and not one `used` flag on each word:** a word used by
word search must remain available to hangman and vice versa — they're
different games with different players' memories of what they've seen.
Confirmed explicitly in conversation: "using a word in one doesn't disable
it from the others" — correct, by this design.

### The shared fetch-or-refill function

One function, called by every consuming game with `(topicSlug, count,
shapeFilter)`:

1. Read `wordPool/{topicSlug}`, subtract `wordUsage/{game}-{topicSlug}.used`,
   filter by the caller's shape rule (see below), giving the available set.
2. If `available.length >= count`: pick randomly, return. No model call.
3. If not enough — **whether the pool is low, or doesn't exist at all, same
   code path** — call the model chain from §1 for a generous batch (40–120
   words, not just what's needed right now), write results into the pool
   (dedup against existing), then serve. This mirrors what
   `generateWordSearchPuzzle` already does today for a brand-new topic, so
   it's not new latency behavior, just newly shared.
4. Marking something `used` only happens on **actual play/selection**, not
   on being shown as a candidate — important for multiplayer's "browse 5-8
   suggestions" flow in §5, where showing a suggestion must not burn it.

**Shape filtering, per consumer, no schema tagging needed:**
- Word search: single token, letters only, 3–10 chars.
- Hangman (solo): single token, letters only, 5–10 chars.
- Hangman (multiplayer suggestions): single token *or* short phrase (spaces
  allowed) — matches the existing validator already used by
  `checkHangmanWord`/`getHangmanHint` for human-typed words
  (`/^[A-Z]+( [A-Z]+)*$/`, ≤18 letters).
- Bloom: whatever `generateBloomPuzzle`'s base-word logic currently requires
  — check `bloomEngine.ts`/`bloomVocabulary.ts` before assuming shape.
- Wordle: exactly 5 letters, no trailing S (existing rule in
  `generateWordleWords`, keep it).

A word too short for hangman (e.g. a 4-letter word-search entry) is simply
invisible to hangman's read — no flag, no migration, just a length check at
read time.

**Lazy clue enrichment for hangman:** pool words sourced from word search
have no clue (word search never needed one). The first time hangman selects
such a word, generate its clue then and write it back onto that pool entry,
so every future hangman/Bloom pull of that same word gets the clue for
free. Word search's own latency is never affected by this.

## 3. Per-game changes

### Word search — minor, additive only
`generateWordSearchPuzzle` already calls `generateTopicWords` live every
time and already writes a `topicSlug`. Add one more write: upsert those same
words into `wordPool/{topicSlug}` (dedup against existing entries). No
change to word search's own behavior or the puzzle doc it writes today.

### Hangman (solo) — migrate off the fixed five buttons
Today: `getHangmanWord` picks a category from a hardcoded list of 5
(Animals, Food, Movies, Sports, Anything) and calls the model live every
time, only softened by a short in-memory avoid-list. **Decided:** fully
converge onto the same topic space word search already builds. The fixed
five become pinned/default entries in that same system rather than a
separate hardcoded list; additional categories are surfaced from the
family's own word-search history (see §4). `getHangmanWord` becomes a thin
wrapper around the shared fetch-or-refill function from §2 with the solo
shape filter.

### Hangman (multiplayer) — new feature
Today: setter can only type their own word; `getHangmanHint` and
`checkHangmanWord` assist a human-authored word (clue suggestion, spelling
check) — these two callables are unaffected by any of this, since there's
no word to *pick*, only a clue to write for whatever a person typed.

**New:** setter is offered a second path alongside "write from scratch" —
**pick a category, get 5–8 word/phrase suggestions** (fetch-or-refill with
`count: 8`, multiplayer's phrase-permitting shape filter), with a **"load
more"** button for another batch (fetch-or-refill again, excluding what was
already shown this session so the player doesn't see instant repeats within
one browse — this is a client-side session exclusion, not a `used` write).
Only tapping to actually **select** a suggestion and start the round writes
to `wordUsage`. Client work: likely lands in
[HangmanOnline.tsx](src/screens/HangmanOnline.tsx), which already threads a
`ProviderSource` badge — check that file's current setter-flow UI before
building, don't assume its shape.

### Word Bloom — needs its own pool shape, confirmed this session, not just a port of hangman's
`getBloomPuzzle`'s base-word convergence (documented in its own code
comment: GARDEN/DANGER recurring) is the same disease as hangman's, just
observed live in this session too ("Word Bloom seems to be giving me the
same results each time"). The FIX is the same principle (a persistent
pool + usage tracking beats a live call every time), but **do not try to
route this through `wordBank.ts`'s existing `fetchWords`/`PoolWord` as-is
— checked this session and it doesn't fit:**

- Hangman/word search pick ONE word (or several) from a category — a flat
  list is the right shape, which is exactly what `PoolWord` is.
- Bloom's model call does something structurally different: it invents a
  6-7 letter base word **and derives its entire playable sub-word list in
  the same response** (`generateBloomPuzzle` in `wordGames.ts` — read it).
  The generated content isn't "a word from a list," it's a whole
  self-contained puzzle object (`{ base, words: string[] }`), and every
  `word` in that list has to actually be spellable from `base`'s letters —
  an internal-consistency constraint `PoolWord`'s flat `{word, hint?}`
  shape has no room for.
- There's also no "category" or topic concept in Bloom at all today — it's
  not per-topic, just "pick any good base word," which is arguably *why*
  it converges (nothing anchors variety the way a topic does for hangman).

**Recommended shape** (not built, this is the design to build against):
a parallel, Bloom-specific pool — e.g. `bloomBasePool/{base}` holding
`{ base, words: string[], addedBy }` per entry, with its own usage
tracking (`bloomBaseUsage` or reuse the `wordUsage` collection with a
`bloom-anywhere` key if a single global pool is fine, which it probably
is given there's no topic to key by). Fetch/refill logic mirrors
`wordBank.ts`'s principle — serve unused entries, bootstrap live when
exhausted — but needs its own small module or a generalized second
function in `wordBank.ts`, not a forced fit into `PoolWord`. Do this
as real design work, not a quick port, when picking Bloom up.

### Wordle — apply the same pattern, both modes
`getDailyWord` already has a 14-day avoid-list (same windowing weakness
class as hangman's 8-word window, just a longer window — confirm whether
it's actually still vulnerable to the same "ages out, repeats" failure
before deciding whether it needs the pool treatment or the window is already
long enough in practice). `getWordleWords` (free play) currently has **no**
avoid-list at all and should get the pool treatment for that reason alone.

### Mini crossword — separate, already-designed rebuild, not part of the pool system
This was designed earlier in the same conversation and deliberately does
**not** join the shared topic-pool system above — a crossword has no
"category," it's "give me a valid 5×5 grid today." Keep it as its own,
simpler piece:

1. The grid pattern (`CROSSWORD_PATTERN` in `wordGames.ts`) is fixed —
   always the same 10 slots (2×3-letter, 4×4-letter, 4×5-letter). Never
   changes, so this is solvable deterministically, not something to ask a
   model to do.
2. Build a **local constraint solver** (MRV + forward-checking backtracking
   — validated working this session; the naive/unordered version thrashes
   and can burn a 200k-step budget without solving, don't use that) that
   fills the grid from a **flat filler word bank**, no theming, no topic
   input. Theming was explicitly considered and explicitly dropped this
   session ("not super interested in theming, it was an idea for angling
   the AI") — don't build the themed/filler-blend version that was
   prototyped and abandoned.
3. **Bank sizing, measured this session against a real frequency-ranked
   common-word list** (not a raw dictionary — a raw system dictionary is
   full of obscure/archaic words unfit for a kids' app): the bottleneck is
   **not** 3-letter words as first assumed, it's **5-letter** coverage.
   Measured thresholds: 3-letter needs only ~150-200 common words, 4-letter
   only ~300, but 5-letter needs **~600+** before the solver reliably fills
   the grid (66/80 at 600, climbing toward 100% by ~650-1200). Build the
   filler bank with real numbers, not the initial (wrong) 3-letter-bottleneck
   assumption.
4. Once the grid is filled (instant, free, deterministic, 100% reliable —
   no more `timeoutSeconds: 180` or truncation risk), make **one batched
   call** for all 10 clues, given the now-fixed answers. This is a pure
   recall/writing task with zero crossing constraints — the same shape as
   the hangman clue prompt, which is exactly where GLM Flash measured well
   this session. **Prompt it explicitly as a crossword clue, not a hangman
   clue** — the two want opposite framing. Hangman's `VAGUE_CLUE_RULES`
   deliberately obscures the answer; crossword clues should be direct and
   gettable. Add something like: *"This is a clue for a mini crossword, not
   a riddle — clear and direct, roughly 7th–8th grade reading level."*
   Matches the existing "13-year-old would recognize" bar used elsewhere in
   `wordGames.ts`, don't invent a new standard.
5. Where to source the filler bank itself: **OPEN.** Options discussed:
   (a) a bundled common-word list filtered by length and curated for family
   appropriateness (the google-10000-english-no-swears list was used for
   testing in this session, not vetted for shipping), or (b) bootstrap it
   via the model once (same idiom as §2's pool bootstrap), giving three
   separate filler pools (3/4/5-letter) that top themselves up the same
   way. (b) is more consistent with the rest of this plan and the project's
   own "never baked-only" standing rule; (a) is simpler and zero-cost.
   Decide before building.
6. This makes `sonnetProvider`/`deepProvidersFrom` and the crossword's
   `timeoutSeconds: 180` dead weight — remove them once this ships.

## 4. Category discovery (word search → hangman)

**Decided:** don't maintain two separate category systems. Hangman's
category picker (solo and the new multiplayer suggestion flow) should
surface from the same topic space word search already populates — query
`wordSearchPuzzles` (or better, `wordPool` once it exists) for topics the
family has actually used, offered alongside pinned defaults (the original
five). Typing a brand-new topic in either game triggers the same
bootstrap path from §2. **OPEN:** exact UI for this — a topic picker
component shared between word search's entry field and hangman's category
buttons, versus two separate but pool-backed UIs. Not resolved in
conversation; a reasonable default is to keep the two entry UIs distinct
(word search's free-text field, hangman's button grid) since they're
different interaction patterns, but have both read from the same
`wordPool` collection underneath.

## 5. Cost and reliability data actually measured this session

Numbers to sanity-check against, not re-derive from scratch:

- GLM-5.3-Flash at `reasoning: {effort: 'low'}`: ~$0.00006/call on a
  20-word topic-word-list ask. Roughly 12x cheaper than Haiku per call.
- GLM-5.3 (non-Flash) at the same effort: ~$0.001/call — despite a lower
  headline per-token price than Haiku, reasoning overhead puts it *above*
  Haiku per real call. Headline $/M tokens does not survive contact with a
  reasoning model; always measure the real call cost, not the rate card.
- Bootstrapping a 120-word category bank (Animals, via GLM Flash): $0.0018,
  one-time.
- GLM-5.3 (non-Flash) at `effort: 'high'` on the old crossword-grid-filling
  prompt: **failed entirely**, truncating after 16,384 reasoning tokens with
  zero output — $0.047 per failed call. This is what the §1 `max_tokens`/
  `reasoning.effort` bug produces when left uncapped on a hard task; it's
  also part of why §3's crossword redesign removes that task from any model
  entirely rather than trying to tune around it.
- Both GLM-5.3 and GLM-5.3-Flash return **HTTP 400** if you send
  `reasoning: {enabled: false}` — these are reasoning-only models, effort
  can be tuned but not disabled. Not every OpenRouter model is like this —
  confirmed non-reasoning siblings exist under the price ceiling (e.g.
  `qwen/qwen3-30b-a3b-instruct-2507`, `deepseek/deepseek-chat`) if a
  reasoning-free model is ever wanted for some other task.

## 6. Build order

Dependencies run one direction — build in this order:

1. Confirm/commit the `providers.ts` `max_tokens`/`reasoning.effort` fix
   (§1) is actually in the tree, and make the three-tier chain change
   (Gemini flagship → GLM Flash via OpenRouter → Haiku direct).
2. Build the `wordPool`/`wordUsage` schema and the shared fetch-or-refill
   function (§2). Everything else depends on this existing and working.
3. Word search's seed-back write (§3) — smallest, lowest-risk integration,
   good first real usage of the shared function.
4. Hangman solo migration (§3) — second consumer, proves the pattern works
   for a "pick one" (not "pick twenty") caller.
5. Hangman multiplayer suggestion feature (§3) — new UI, builds on #4's
   backend work.
6. Bloom and Wordle (§3) — apply the now-proven pattern; check each game's
   actual code before assuming the hangman shape transfers directly.
7. Mini crossword rebuild (§3) — independent of 2-6, can be built in
   parallel or in any order relative to them, since it deliberately doesn't
   touch the shared pool system.
8. Delete `sonnetProvider`/`deepProvidersFrom` and the crossword's
   `timeoutSeconds: 180` once #7 ships and nothing calls them.

## 7. Open decisions to make during execution

- Exact Gemini flagship alias string (§1) — verify against `@google/genai`
  docs at build time, don't hardcode from memory.
- Crossword filler bank sourcing — bundled list vs. model-bootstrapped
  (§3.6).
- Low-water-mark threshold for proactive pool refill (a number like 15 was
  discussed as a reasonable default, not committed).
- Whether `getDailyWord`'s existing 14-day window is actually vulnerable to
  the same repeat bug hangman's 8-word window showed, or whether 14 days is
  long enough in practice — worth a quick check with real data before
  deciding it needs the full pool treatment.
- UI for shared category discovery between word search and hangman (§4).
