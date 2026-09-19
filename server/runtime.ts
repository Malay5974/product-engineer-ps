import { Store } from "./store.js";
import { fakeResponse } from "./generator.js";

export class Runtime {
  private active = new Set<string>();
  constructor(private store: Store) {}
  start(
    conversationId: string,
    input: string,
    options: { count?: number; failAt?: number; delayMs?: number } = {},
  ) {
    const run = this.store.createRun(conversationId, input);
    this.store.append(run.id, "run_started", "");
    this.active.add(run.id);
    void this.generate(run.id, options);
    return run;
  }
  private async generate(
    runId: string,
    options: { count?: number; failAt?: number; delayMs?: number },
  ) {
    try {
      for await (const chunk of fakeResponse(
        this.store.getRun(runId)?.input ?? "",
        options,
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
