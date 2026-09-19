import { Store } from "./store.js";
import { Runtime } from "./runtime.js";
const store = new Store(":memory:");
const runtime = new Runtime(store);
const run = runtime.start("benchmark", "benchmark", { count: 30, delayMs: 5 });
await new Promise((resolve) => setTimeout(resolve, 28));
const receivedBeforeDisconnect = store.eventsAfter(run.id, 0);
const cursor = receivedBeforeDisconnect.at(-1)?.sequence ?? 0;
const receivedSequences = receivedBeforeDisconnect.map(
  (event) => event.sequence,
);
await new Promise((resolve) => setTimeout(resolve, 220));
const replayedAfterReconnect = store.eventsAfter(run.id, cursor);
const combined = [...receivedBeforeDisconnect, ...replayedAfterReconnect];
const sequences = combined.map((e) => e.sequence);
const unique = new Set(sequences);
const final = store.getRun(run.id);
const expected = Array.from({ length: 32 }, (_, index) => index + 1);
const missing = expected.filter((sequence) => !unique.has(sequence));
const duplicates = sequences.length - unique.size;
if (
  !final ||
  final.state !== "completed" ||
  missing.length ||
  duplicates ||
  sequences.length !== expected.length
)
  throw new Error(
    `benchmark failed: state=${final?.state} events=${sequences.length} missing=${missing.length} duplicates=${duplicates}`,
  );
console.log(
  JSON.stringify(
    {
      generatedWhileDisconnected: replayedAfterReconnect.length,
      events: sequences.length,
      uniqueEvents: unique.size,
      disconnectCursor: cursor,
      finalState: final.state,
      missing: missing.length,
      duplicates,
    },
    null,
    2,
  ),
);
