# Calendar feature — parked

The Calendar feature (ICS feed sync + Google Calendar sync) was never
finished — it only ever rendered hardcoded sample events. Hidden from the
live app on 2026-09-20 so it doesn't cost anything or confuse anyone before
it's actually built. Nothing was deleted; it's just unhooked and copied here.

## What's in this folder

- `CalendarScreen.tsx` — the full screen component, removed from
  `src/screens/`.
- `sampleData.ts` — the `ScheduleEvent` type and `sampleEvents` array,
  removed from `src/lib/sampleData.ts` (that file's `ScoreEntry`/
  `IS_SAMPLE_DATA`/`sampleScores` stayed — Scores still uses them).
- `functions-index-stubs.ts` — the `syncIcsFeeds` and `syncGoogleCalendar`
  scheduled Cloud Function stubs, removed from `functions/src/index.ts`.
  They never did real work (just logged and returned), but as live
  `pubsub.schedule` exports they'd still deploy and burn a Cloud Scheduler
  slot every 4 hours for nothing.

## What was left in place (inert, harmless)

- `firestore.rules` — the `/schedule/{eventId}` match block (~line 202) was
  left alone. It only grants read access to a collection nothing ever
  writes to.
- `src/lib/format.ts` — `dayLabel`, `timeLabel`, `groupByDay` are
  calendar-only helpers but are shared utility exports, so they were left
  rather than touched.
- `src/components/icons.tsx` — `IconCalendar` export left in place (unused
  but harmless).

## To resume

1. Move `CalendarScreen.tsx` back to `src/screens/`.
2. Merge `sampleData.ts`'s `ScheduleEvent`/`sampleEvents` back into
   `src/lib/sampleData.ts`.
3. Re-add `'calendar'` to the `Route` union and both `routeToPath`/
   `pathToRoute` switches in `src/lib/router.tsx`.
4. Re-import and re-render `CalendarScreen` in `src/App.tsx`.
5. Re-add the Home hub card and "Up next" section in `src/screens/Home.tsx`
   (check git history around 2026-09-20 for the exact block if needed).
6. Paste `functions-index-stubs.ts`'s two exports back into
   `functions/src/index.ts`.
7. Actually implement the ICS/Google Calendar sync logic — none of this
   ever did real work.
