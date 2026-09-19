import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { runMigrations } from "./migrations.js";
import type { ConversationEvent, EventKind, Run, RunState } from "./types.js";

export class Store {
  private db: Database.Database;
  constructor(filename = ":memory:") {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    runMigrations(this.db);
    this.recoverInterruptedRuns();
  }
  createRun(conversationId: string, input: string): Run {
    if (!conversationId.trim()) throw new Error("conversationId is required");
    if (!input.trim()) throw new Error("input is required");
    const run: Run = {
      id: randomUUID(),
      conversationId,
      userMessageId: randomUUID(),
      input,
      state: "running",
      nextSequence: 1,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        "INSERT INTO runs VALUES (@id,@conversationId,@userMessageId,@input,@state,@nextSequence,@createdAt)",
      )
      .run(run);
    return run;
  }
  getRun(id: string): Run | undefined {
    return this.db
      .prepare(
        "SELECT id, conversation_id conversationId, user_message_id userMessageId, input, state, next_sequence nextSequence, created_at createdAt FROM runs WHERE id=?",
      )
      .get(id) as Run | undefined;
  }
  append(runId: string, kind: EventKind, payload: string): ConversationEvent {
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
    this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO events VALUES (@id,@runId,@sequence,@kind,@payload,@createdAt)",
        )
        .run(event);
      this.db
        .prepare("UPDATE runs SET next_sequence=next_sequence+1 WHERE id=?")
        .run(runId);
    })();
    return event;
  }
  eventsAfter(runId: string, cursor: number): ConversationEvent[] {
    return this.db
      .prepare(
        "SELECT id, run_id runId, sequence, kind, payload, created_at createdAt FROM events WHERE run_id=? AND sequence>? ORDER BY sequence",
      )
      .all(runId, cursor) as ConversationEvent[];
  }

  private recoverInterruptedRuns(): void {
    const runningRuns = this.db
      .prepare(
        "SELECT id, next_sequence nextSequence FROM runs WHERE state='running'",
      )
      .all() as Array<{ id: string; nextSequence: number }>;

    this.db.transaction(() => {
      for (const run of runningRuns) {
        const event: ConversationEvent = {
          id: randomUUID(),
          runId: run.id,
          sequence: run.nextSequence,
          kind: "run_interrupted",
          payload: "Service restarted before generation completed",
          createdAt: new Date().toISOString(),
        };
        this.db
          .prepare(
            "INSERT INTO events (id, run_id, sequence, kind, payload, created_at) VALUES (@id, @runId, @sequence, @kind, @payload, @createdAt)",
          )
          .run(event);
        this.db
          .prepare(
            "UPDATE runs SET state='interrupted', next_sequence=next_sequence+1 WHERE id=? AND state='running'",
          )
          .run(run.id);
      }
    })();
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
    return this.db.transaction(() => {
      const event = this.append(runId, kind, payload);
      this.db
        .prepare("UPDATE runs SET state=? WHERE id=? AND state=?")
        .run(state, runId, "running");
      return event;
    })();
  }
  close(): void {
    this.db.close();
  }
}
