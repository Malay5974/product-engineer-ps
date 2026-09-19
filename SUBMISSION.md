# Product Engineering Challenge Submission

## Candidate

- **Name:** Delwadiya Malay
- **Email:** malaydelwadiya3031@gmail.com
- **GitHub:** https://github.com/Malay5974
- **Selected problem:** Problem 1 — Resumable Realtime Conversation
- **Demo video:** TODO — add accessible Google Drive link

## Run the project

Requires Node.js 24. Run `nvm use` before installing dependencies.

```text
npm install
npm run dev:server
npm run dev:client
```

Open `http://localhost:5173/client/`. Use the browser controls to start a reply, disconnect, reconnect from the saved cursor, and simulate provider failure.

## Run the tests and benchmark

```text
npm run build
npm test
npm run benchmark
```

The benchmark generates 30 ordered response events, disconnects while generation is active, replays from the recorded cursor, and verifies zero missing and duplicate events.

Optional local configuration is documented in `.env.example`. Recovery can also be requested explicitly with `POST /api/runs/:runId/resume`; the operation is safe to repeat for the same active run.

## Current implementation

The server stores runs and ordered events in SQLite. Versioned migrations are applied automatically at startup, so reviewers do not need to create tables manually. SSE exposes events after a client cursor. The client owns presentation state and deduplicates events by sequence. The deterministic fake provider makes success and failure scenarios repeatable without a paid model API.

## Acceptance scenarios

Implemented: ordered live stream, missed-event replay, replay/live deduplication, durable history across database reopen, partial generation failure, and explicit cursor validation.

## Assumptions and limitations

- The fake generator is used instead of a live model provider.
- A process restart preserves history and automatically resumes an in-progress deterministic generator from its last persisted chunk. A production provider would additionally need an idempotency key or provider-side checkpoint for safe external retries.
- Authentication, multi-user conversations, multiple simultaneous runs, and production-scale deployment are out of scope.

## Technology choices

React and TypeScript provide a small browser client with explicit connection state. Node.js and SSE keep server-to-client streaming simple. SQLite makes durable event history easy for reviewers to run locally. A production multi-instance deployment would likely use PostgreSQL and a shared event or job infrastructure.

## AI usage

TODO — describe AI tools used and how their output was reviewed.

## Credibility note

TODO — add a previously shipped product, personal contribution, scale, difficult decision, and evidence link where available.
