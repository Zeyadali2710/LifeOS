# Knowledge and Goals (Phase 8)

## Knowledge (`/knowledge`)

Items are notes, documents, bookmarks, ideas or research, with tags and an optional linked project. Owner-only.

- **Add:** New item (any kind), or Upload a `.md`/`.txt` file (UTF-8, up to 500 KB; the first `# Heading` becomes the title). PDFs are not supported.
- **Bookmarks** need an `https://` link. LifeOS never fetches the page (no server-side requests to arbitrary URLs).
- **Limits:** title 200, text 200,000 characters, up to 12 tags of 40 characters. Tags are lower-cased, `#` and spaces removed.
- **Keyword search** runs entirely inside LifeOS: Postgres full-text search (`simple` config, prefix matching, all words must match) on title and text, plus exact tag matches. Only letter/number tokens reach `to_tsquery`.
- **Semantic search is off by default.** Turning it on (Semantic mode on the page) sends each item's title and text (first 8,000 characters, always within the model's token limit) and each semantic query to OpenRouter's embeddings API using `openai/text-embedding-3-small`, with the OpenRouter key already saved in Settings → Connections. Vectors (1536-d, pgvector) are stored in `knowledge_items.embedding`.
  - The worker job `knowledge.embed` runs every 10 minutes (and right after saves) and embeds only items whose `md5(title || body)` differs from `embedded_hash`, so edits re-index and deletes need nothing. An edit during an embedding call leaves the item pending. Failures are logged and retried next run. The page shows "Semantic index N/M".
  - Turning it off stops all further calls; stored vectors remain unused.
- **Ask Knowledge** sends retrieved items to Anthropic (paid model) through the Knowledge agent. Knowledge never reaches a free model.

## Goals (`/goals`)

Vision (one sentence, `settings` key `goals.vision`) → goals → objectives → linked projects → tasks.

- **One objective per project** (`objective_projects.project_id` is the key), so tasks are never counted twice. Linking a project elsewhere moves it. Archived projects are ignored.
- **Objective progress:** manual % if set (stays fixed until cleared), otherwise completed/total tasks across linked projects; "no tasks yet" (—) when there is nothing to measure. Done objectives count as 100%.
- **Goal progress:** mean of measurable objectives; done goals are 100%.
- **Momentum:** linked tasks completed in the last 14 days vs the 14 days before → rising / steady / slowing, or "no recent activity".
- **Neglect:** an active objective under an active goal whose latest activity (objective created/edited, project linked, linked task created/completed) is more than 21 days old.
- **Horizons:** objective target date (else the goal's) in Sydney time: this week (to Sunday, includes overdue), this month, this year, long term (later or no date).
- Ticking a task in the tree uses the normal task completion action (same dependency/blocked-state handling as elsewhere); blocked tasks are labelled.
- The header sentence counts active goals with rising momentum.

## Deploy

Migration `0013_knowledge_goals` runs `CREATE EXTENSION IF NOT EXISTS vector` (the `pgvector/pgvector:pg17` image ships it; the compose database user is the image's superuser) and adds `knowledge_items`, `goals`, `objectives`, `objective_projects`. Additive only.
