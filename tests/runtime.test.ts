import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.js";
import { Runtime } from "../server/runtime.js";

const waitFor = async (store: Store, id: string) => {
  for (let i = 0; i < 100; i++) {
    const run = store.getRun(id);
    if (run?.state !== "running") return run;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("timed out");
};

describe("resumable conversation runtime", () => {
  it("persists ordered events and replays after a cursor", async () => {
    const store = new Store();
    const runtime = new Runtime(store);
    const run = runtime.start("c1", "hello", { count: 5 });
    const final = await waitFor(store, run.id);
    const events = store.eventsAfter(run.id, 0);
    expect(final?.state).toBe("completed");
    expect(events.map((event) => event.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(store.eventsAfter(run.id, 3).map((event) => event.sequence)).toEqual(
      [4, 5, 6, 7],
    );
    store.close();
  });
  it("records a failed run after partial generation", async () => {
    const store = new Store();
    const runtime = new Runtime(store);
    const run = runtime.start("c1", "hello", { count: 5, failAt: 2 });
    const final = await waitFor(store, run.id);
    const events = store.eventsAfter(run.id, 0);
    expect(final?.state).toBe("failed");
    expect(events.filter((event) => event.kind === "chunk")).toHaveLength(2);
    expect(events.at(-1)?.kind).toBe("run_failed");
    store.close();
  });
  it("keeps failed runs terminal and rejects invalid failure configuration", async () => {
    const store = new Store();
    const runtime = new Runtime(store);
    expect(() =>
      store.createRun("c1", "hello", { count: 3, failAt: 3 }),
    ).toThrow("failAt must identify a chunk within the run");
    expect(() =>
      store.createRun("c1", "hello", { count: 3, failAt: -1 }),
    ).toThrow("failAt must identify a chunk within the run");

    const run = runtime.start("c1", "hello", { count: 4, failAt: 2 });
    const failed = await waitFor(store, run.id);
    expect(failed?.state).toBe("failed");
    expect(() => runtime.resumeRun(run.id)).toThrow(
      "cannot resume a failed run",
    );
    expect(store.eventsAfter(run.id, 0).at(-1)?.kind).toBe("run_failed");
    expect(store.eventsAfter(run.id, 0)).toHaveLength(4);
    store.close();
  });
  it("deduplicates replay/live overlap by event identity", async () => {
    const store = new Store();
    const runtime = new Runtime(store);
    const run = runtime.start("c1", "hello", { count: 3 });
    await waitFor(store, run.id);
    const all = store.eventsAfter(run.id, 0);
    const overlap = [...all, ...store.eventsAfter(run.id, 2)];
    const unique = new Map(overlap.map((event) => [event.sequence, event]));
    expect([...unique.keys()]).toEqual([1, 2, 3, 4, 5]);
    store.close();
  });
  it("restores persisted run history after reopening the database", async () => {
    const directory = mkdtempSync(join(tmpdir(), "caygnus-"));
    const filename = join(directory, "conversation.db");
    const firstStore = new Store(filename);
    const runtime = new Runtime(firstStore);
    const run = runtime.start("c1", "restart me", { count: 2 });
    await waitFor(firstStore, run.id);
    const before = firstStore.eventsAfter(run.id, 0);
    firstStore.close();
    const reopened = new Store(filename);
    expect(reopened.getRun(run.id)?.state).toBe("completed");
    expect(
      reopened.eventsAfter(run.id, 0).map((event) => event.sequence),
    ).toEqual(before.map((event) => event.sequence));
    reopened.close();
    rmSync(directory, { recursive: true, force: true });
  });
  it("resumes an in-progress run after service restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "caygnus-"));
    const filename = join(directory, "conversation.db");
    const firstStore = new Store(filename);
    const run = firstStore.createRun("c1", "resumed run", {
      count: 3,
      delayMs: 1,
    });
    firstStore.append(run.id, "run_started", "");
    firstStore.append(run.id, "chunk", "resumed run · response chunk 1");
    firstStore.close();
    const reopened = new Store(filename);
    const runtime = new Runtime(reopened);
    const final = await waitFor(reopened, run.id);
    expect(runtime).toBeDefined();
    expect(final?.state).toBe("completed");
    expect(
      reopened.eventsAfter(run.id, 0).filter((event) => event.kind === "chunk"),
    ).toHaveLength(3);
    reopened.close();
    rmSync(directory, { recursive: true, force: true });
  });
  it("rejects invalid input and terminal-state races", async () => {
    const store = new Store();
    expect(() => store.createRun("c1", "   ")).toThrow("input is required");
    const runtime = new Runtime(store);
    const run = runtime.start("c1", "hello", { count: 1 });
    await waitFor(store, run.id);
    expect(() => store.setState(run.id, "failed", "run_failed")).toThrow(
      "invalid transition",
    );
    store.close();
  });
  it("does not start duplicate generation when a run is resumed twice", async () => {
    const store = new Store();
    const runtime = new Runtime(store);
    const run = runtime.start("c1", "resume safely", { count: 4, delayMs: 1 });
    runtime.resumeRun(run.id);
    runtime.resumeRun(run.id);
    const final = await waitFor(store, run.id);
    expect(final?.state).toBe("completed");
    expect(store.eventsAfter(run.id, 0)).toHaveLength(6);
    store.close();
  });
});
