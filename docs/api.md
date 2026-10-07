# API

All routes require an authenticated owner session unless marked public.

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/*` | * | public | Better Auth (sign-in, sign-out, session) |
| `/api/health` | GET | public | `{ status, db, worker, version }` — no secrets, no internals |

Later phases append here (activity SSE stream, notifications, chat, approvals, …).
