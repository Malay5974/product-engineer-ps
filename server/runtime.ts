import { Store } from "./store.js";
import { fakeResponse } from "./generator.js";
import type { Run } from "./types.js";

export class Runtime {
  private active = new Set<string>();
  constructor(private store: Store) {
    for (const run of store.runningRuns()) this.resumeRun(run.id);
  }
  start(
    conversationId: string,
    input: string,
    options: { count?: number; failAt?: number; delayMs?: number } = {},
  ) {
    const run = this.store.createRun(conversationId, input, options);
    this.store.append(run.id, "run_started", "");
    this.active.add(run.id);
    void this.generate(run.id, options, 0);
    return run;
  }
  resumeRun(runId: string): Run {
    const run = this.store.getRun(runId);
    if (!run) throw new Error("Run not found");
    if (run.state !== "running")
      throw new Error(`cannot resume a ${run.state} run`);
    this.resume(run);
    return run;
  }
  private resume(run: Run) {
    if (this.active.has(run.id)) return;
    const generatedChunks = this.store
      .eventsAfter(run.id, 0)
      .filter((event) => event.kind === "chunk").length;
    this.active.add(run.id);
    void this.generate(
      run.id,
      { count: run.chunkCount, delayMs: run.delayMs, failAt: run.failAt },
      generatedChunks,
    );
  }
  private async generate(
    runId: string,
    options: { count?: number; failAt?: number; delayMs?: number },
    startAt = 0,
  ) {
    try {
      for await (const chunk of fakeResponse(
        this.store.getRun(runId)?.input ?? "",
        { ...options, startAt },
      ))
        this.store.append(runId, "chunk", chunk);
      this.store.setState(runId, "completed", "run_completed");
    } catch (error) {
      this.store.setState(
        runId,
        "failed",
        "run_failed",
        error instanceof Error ? error.message : "unknown failure",
      );
    } finally {
      this.active.delete(runId);
    }
  }
}
