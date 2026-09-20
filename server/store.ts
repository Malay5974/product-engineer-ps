import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { runMigrations } from "./migrations.js";
import type { ConversationEvent, EventKind, Run, RunState } from "./types.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (filename: string) => DatabaseSyncType;
};

export class Store {
  private db: DatabaseSyncType;
  constructor(filename = ":memory:") {
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    runMigrations(this.db);
  }
  createRun(
    conversationId: string,
    input: string,
    options: { count?: number; delayMs?: number; failAt?: number } = {},
  ): Run {
    if (!conversationId.trim()) throw new Error("conversationId is required");
    if (!input.trim()) throw new Error("input is required");
    const chunkCount = options.count ?? 12;
    const delayMs = options.delayMs ?? 100;
    if (!Number.isInteger(chunkCount) || chunkCount < 1)
      throw new Error("count must be a positive integer");
    if (!Number.isFinite(delayMs) || delayMs < 0)
      throw new Error("delayMs must be a non-negative number");
    if (
      options.failAt !== undefined &&
      (!Number.isInteger(options.failAt) ||
        options.failAt < 0 ||
        options.failAt >= chunkCount)
    )
      throw new Error("failAt must identify a chunk within the run");
    const run: Run = {
      id: randomUUID(),
      conversationId,
      userMessageId: randomUUID(),
      input,
      state: "running",
      nextSequence: 1,
      createdAt: new Date().toISOString(),
      chunkCount,
      delayMs,
      failAt: options.failAt,
    };
    this.db
      .prepare(
        "INSERT INTO runs (id, conversation_id, user_message_id, input, state, next_sequence, created_at, chunk_count, delay_ms, fail_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        run.id,
        run.conversationId,
        run.userMessageId,
        run.input,
        run.state,
        run.nextSequence,
        run.createdAt,
        run.chunkCount,
        run.delayMs,
        run.failAt ?? null,
      );
    return run;
  }
  getRun(id: string): Run | undefined {
    return this.db
      .prepare(
        "SELECT id, conversation_id conversationId, user_message_id userMessageId, input, state, next_sequence nextSequence, created_at createdAt, chunk_count chunkCount, delay_ms delayMs, fail_at failAt FROM runs WHERE id=?",
      )
      .get(id) as Run | undefined;
  }
  runningRuns(): Run[] {
    return this.db
      .prepare(
        "SELECT id, conversation_id conversationId, user_message_id userMessageId, input, state, next_sequence nextSequence, created_at createdAt, chunk_count chunkCount, delay_ms delayMs, fail_at failAt FROM runs WHERE state='running'",
      )
      .all() as unknown as Run[];
  }
  append(runId: string, kind: EventKind, payload: string): ConversationEvent {
    return this.transaction(() =>
      this.appendWithinTransaction(runId, kind, payload),
    );
  }
  private appendWithinTransaction(
    runId: string,
    kind: EventKind,
    payload: string,
  ): ConversationEvent {
    const run = this.getRun(runId);
    if (!run) throw new Error("Run not found");
    const event: ConversationEvent = {
      id: randomUUID(),
      runId,
      sequence: run.nextSequence,
      kind,
      payload,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare("INSERT INTO events VALUES (?,?,?,?,?,?)")
      .run(
        event.id,
        event.runId,
        event.sequence,
        event.kind,
        event.payload,
        event.createdAt,
      );
    this.db
      .prepare("UPDATE runs SET next_sequence=next_sequence+1 WHERE id=?")
      .run(runId);
    return event;
  }
  eventsAfter(runId: string, cursor: number): ConversationEvent[] {
    return this.db
      .prepare(
        "SELECT id, run_id runId, sequence, kind, payload, created_at createdAt FROM events WHERE run_id=? AND sequence>? ORDER BY sequence",
      )
      .all(runId, cursor) as unknown as ConversationEvent[];
  }

  setState(
    runId: string,
    state: RunState,
    kind: EventKind,
    payload = "",
  ): ConversationEvent {
    const run = this.getRun(runId);
    if (!run) throw new Error("Run not found");
    if (run.state !== "running")
      throw new Error(`invalid transition from ${run.state} to ${state}`);
    return this.transaction(() => {
      const event = this.appendWithinTransaction(runId, kind, payload);
      this.db
        .prepare("UPDATE runs SET state=? WHERE id=? AND state=?")
        .run(state, runId, "running");
      return event;
    });
  }
  private transaction<T>(callback: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close(): void {
    this.db.close();
  }
}
