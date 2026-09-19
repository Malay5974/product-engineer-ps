# Resumable realtime conversation implementation

## Run locally

Requires Node.js 24 (the repository includes `.nvmrc`).

The repository includes `.nvmrc` with the recommended Node.js 24 runtime. Use `nvm use` before installing dependencies when available.

Because `better-sqlite3` contains a native binary, if Node.js is changed after `npm install`, rebuild it for the active runtime:

```text
npm rebuild better-sqlite3
```

```text
npm install
npm run dev:server   # terminal 1, http://localhost:3000
npm run dev:client   # terminal 2, http://localhost:5173/client/
```

The server stores durable history in `conversation.db`. Set `DB_FILE` to use a different SQLite file. The client uses a deterministic fake response generator, so no model API key is required.

## Verification

```text
npm run build
npm test
npm run benchmark
```

The benchmark creates 30 ordered chunks, waits for completion, replays after a cursor, and verifies exactly 32 events (run-start, 30 chunks, run-completed), zero duplicates, zero missing events, and a completed terminal state.

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

Each event has a stable ID and monotonically increasing per-run sequence. The server owns ordering. The client ignores an event whose sequence it has already rendered. A reconnect requests `events?cursor=N`, allowing persisted replay to transition into live delivery without duplicate display.

The server logs stream connection/disconnection and shutdown lifecycle events as structured JSON. On shutdown it closes active streams and the database cleanly.

If the process stops during generation, already persisted events remain inspectable. On startup, any run left in `running` state is durably transitioned to `interrupted` with a terminal event. The prototype does not resume the fake generator; production behavior could use a durable job and retry policy instead.
