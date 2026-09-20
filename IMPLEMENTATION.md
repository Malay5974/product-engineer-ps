# Resumable realtime conversation implementation

## Run locally

Requires Node.js 24 (the repository includes `.nvmrc`).

The repository includes `.nvmrc` with the recommended Node.js 24 runtime. Use `nvm use` before installing dependencies when available.

```text
npm install
npm run dev:server   # terminal 1, http://localhost:3000
npm run dev:client   # terminal 2, http://localhost:5173/client/
```

The server stores durable history in `conversation.db` using Node.js 24's built-in synchronous SQLite API. Set `DB_FILE` to use a different SQLite file. The client uses a deterministic fake response generator, so no model API key is required. No native SQLite package rebuild is required.

Optional environment settings are documented in `.env.example`. The server also exposes `POST /api/runs/:runId/resume` for an explicit, idempotent resume request; repeated requests do not create a second generator because the runtime tracks active runs.

## Verification

```text
npm run build
npm test
npm run benchmark
```

The benchmark starts the real backend with a temporary SQLite database and uses
the HTTP and SSE endpoints. It verifies four scenarios: disconnect/reconnect
with 30 ordered text events, partial provider failure, backend stop and restart
with durable recovery, and invalid-cursor handling. It reports the cursor,
events received before and after reconnect, missing events, duplicate events,
terminal events, and final run states. The successful benchmark output includes
zero missing events, zero duplicates, a failed terminal state for the injected
failure scenario, and completed terminal states for the successful scenarios.

## Test commands

Run the complete test suite:

```text
npm test
```

Run the runtime test file only:

```text
npm run test:single
```

Run one test by name:

```text
npm run test:case -- "records a failed run after partial generation"
```

Run tests in watch mode while developing:

```text
npm run test:watch
```

## Architecture

- `server/store.ts`: atomic event/run persistence.
- `server/migrations.ts`: versioned SQLite migrations applied automatically at startup.
- `server/runtime.ts`: run lifecycle and deterministic provider orchestration.
- `server/generator.ts`: controllable fake response stream, including failure injection.
- `server/index.ts`: HTTP API and cursor-based SSE stream.
- `server/http.ts`: shared JSON success, error, options, and request-body helpers.
- `server/logger.ts`: structured lifecycle logging without message-content logging.
- `client/src/main.tsx`: connection state, cursor tracking, and event deduplication.
- `client/src/api.ts`: the single frontend JSON HTTP wrapper; new JSON API calls should use `requestJson`.
- `tests/runtime.test.ts`: ordering, replay, failure, and replay/live overlap tests.

GitHub Actions runs formatting, build, tests, and the benchmark on every push and pull request.

Each event has a stable ID and monotonically increasing per-run sequence. The server owns ordering. The client ignores an event whose sequence it has already rendered. A reconnect requests `events?cursor=N`, allowing persisted replay to transition into live delivery without duplicate display.

The server logs stream connection/disconnection and shutdown lifecycle events as structured JSON. On shutdown it closes active streams and the database cleanly.

Before closing active SSE streams, the server sends a `server_shutdown` transport event so clients can show an explicit disconnected state instead of relying only on browser-level connection errors.

If the process stops during generation, already persisted events remain inspectable. On startup, any run left in `running` state is resumed from the number of persisted chunks. Generation options are stored with the run, so the same run continues and eventually emits one terminal event. A production provider would additionally need an idempotency key or provider-side checkpoint to make external model calls safe across process restarts.
