# #21: Transcript search and a synced recording player

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/21 |
| **Assignee** | Tejaswini (`Tejaswini2706`) |
| **Branch** | `feature/21-transcript-search` |
| **PR into** | `dev` |
| **Order** | Tejaswini's 6th issue |
| **Depends on** | nothing |
| **Blocks** | nothing |
| **Size** | ~5–6 days |

## 1. Summary

Find **any moment in any call** and hear it. That means full-text search across transcripts and summaries with filters and highlighted matches, and on the call detail a recording player with a waveform where clicking a transcript line jumps the audio there and the current line highlights while it plays.

## 2. What already exists

- `calls.transcript` (text), `calls.transcript_turns` (jsonb: the turns `[{ role, text, ... }]`, sometimes with timestamps from Sarvam), `calls.summary`, `calls.answers`, `calls.recording_path` / `recording_url`.
- Pages: `transcripts.tsx`, `call-recordings.tsx`, call detail views (campaign contact drawer, call history).
- Recordings are stored in Supabase Storage (signed URLs).

## 3. Scope

**In scope:** a Postgres full-text index plus a search RPC, the Transcripts page search/filters/highlights, a waveform player synced with the transcript, objection/next-step highlights.

**Out of scope:** speaker diarisation, semantic/vector search (note it as a follow-up), editing transcripts.

## 4. What to build, point by point

### 4.1 Search in Postgres
1. Migration: a generated column
   `search_tsv tsvector generated always as (setweight(to_tsvector('simple', coalesce(summary,'')), 'A') || setweight(to_tsvector('simple', coalesce(transcript,'')), 'B')) stored`
   plus a GIN index. Use the `simple` config (transcripts mix Hindi/English; stemming for English only would miss things).
2. An RPC `search_calls(org uuid, q text, agent uuid default null, outcome text default null, from_ts timestamptz default null, to_ts timestamptz default null, lang text default null, lim int default 25, off int default 0)` returning id, contact name, phone, agent, started_at, duration, outcome, `ts_rank`, and a **snippet** via `ts_headline('simple', transcript, query, 'StartSel=<mark>,StopSel=</mark>,MaxWords=30,MinWords=10,MaxFragments=2')`.
3. Build the query with `websearch_to_tsquery('simple', q)`, so users can type `renewal "next week" -cancel`.
4. `security invoker` (RLS applies), plus an explicit `organization_id = org` filter.

### 4.2 Transcripts page
5. A search box (debounced 300 ms) and filters: agent, outcome (interested / not interested / callback / …), date range, language. Keep them in the URL.
6. Results list: contact, date, agent, outcome badge, duration, and the snippet with `<mark>` highlights. **Sanitise:** only allow `<mark>` tags when rendering, and escape everything else.
7. Empty query → the latest calls. No results → "No calls mention '<q>'". Paginate with "Load more".
8. Clicking a result opens the call detail scrolled to the first matching line.

### 4.3 Synced player (call detail)
9. `npm i wavesurfer.js`. A `RecordingPlayer` component: waveform, play/pause, ±10 s, speed (1×, 1.25×, 1.5×, 2×), current time / total. Load the **signed** recording URL from a server function.
10. Transcript panel beside or under it: one row per turn with a speaker label (Agent / Customer), the text, and a timestamp.
11. **Timestamps:** use the turn start times from `transcript_turns` if Sarvam provides them; otherwise **estimate**: distribute the total duration across turns in proportion to their text length. Mark estimated times with "≈".
12. Click a line → `wavesurfer.setTime(start)` and play. While playing, highlight the current line (the last turn with `start ≤ currentTime`) and auto-scroll it into view (pause auto-scroll if the user scrolls manually).
13. Search matches: when opened from search, highlight the query words in the transcript, with "Next match" / "Previous match" buttons.

### 4.4 Objections and next steps
14. From `answers` (e.g. `objections`, `next_step`, `follow_up_time`, `callback_time`), find the turns that mention those phrases (a simple case-insensitive substring/keyword match) and mark them with coloured left borders and a legend: Objection (amber), Next step (green).

## 5. Data model

```sql
-- 00NN_transcript_search.sql: full-text search over call summaries and transcripts
alter table public.calls add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(summary, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(transcript, '')), 'B')
  ) stored;
create index if not exists calls_search_tsv_idx on public.calls using gin (search_tsv);
-- create or replace function public.search_calls(...) returns table(...) language sql stable security invoker as $$ ... $$;
-- grant execute on function public.search_calls(...) to authenticated;
```

Adding a stored generated column rewrites the table. On a large `calls` table, have the owner apply it at a quiet time; mention this in the PR.

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_transcript_search.sql` | **new** |
| `src/lib/transcript.ts` | **new**: `estimateTurnTimes`, `currentTurnIndex`, `findHighlights`, `sanitizeSnippet` |
| `src/lib/calls.functions.ts` | `searchCalls`, `getRecordingUrl` |
| `src/routes/_authenticated/_app/transcripts.tsx` | search UI |
| `src/components/app/RecordingPlayer.tsx`, `TranscriptView.tsx` | **new** |
| `package.json` | `wavesurfer.js` |
| `src/test/transcript.test.ts` | **new** |

## 7. Rules, edge cases, security

- Search only returns the org's calls.
- Render snippets safely: only `<mark>` is allowed (no `dangerouslySetInnerHTML` of raw transcript text).
- Calls without a recording → a transcript-only view; without a transcript → "No transcript".
- Signed recording URLs expire. Refresh one if playback fails with 403.
- Long transcripts (100+ turns) must stay smooth (virtualise only if needed).

## 8. Testing

**Unit tests:** `estimateTurnTimes` sums to the duration and is monotonic; `currentTurnIndex` at the boundaries; `findHighlights` finds objection phrases case-insensitively; `sanitizeSnippet` strips every tag except `<mark>`.

**Manual:**
1. Search "renewal" → compare with `select id from calls where transcript ilike '%renewal%'` for your org; the results match, with the phrase highlighted.
2. Try `"next week"` (phrase) and `renewal -cancel` (exclude).
3. Open a call → click the 5th line → audio jumps there; the highlight follows playback; speed control works.
4. A call without timestamps shows ≈ times, and clicking is roughly right.
5. Objection/next-step lines are coloured on a call that has those answers.

```bash
npx vitest run src/test/transcript.test.ts
npx vitest run && npx tsc --noEmit && npm run build
```

## 9. Acceptance criteria

- [ ] Searching "renewal" lists matching calls with the phrase highlighted; filters work
- [ ] Clicking a transcript line plays from that point; the current line highlights during playback
- [ ] Objections and next steps are highlighted
- [ ] Search is org-scoped; snippets render safely

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/21-transcript-search
git add db/migrations/00NN_transcript_search.sql src/lib/transcript.ts src/test/transcript.test.ts
git commit -m "Transcripts: full-text search index and helpers"
git push -u origin feature/21-transcript-search
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#21 Transcript search and synced player" --body "Closes #21 ..."
```

## 11. In the pull request

- `Closes #21`; the migration to apply (with the table-rewrite note); a GIF of click-to-seek

## 12. Settle with the lead before starting

- Whether Sarvam returns turn timestamps (check a real `transcript_turns` value together).
- Which languages to filter by.
