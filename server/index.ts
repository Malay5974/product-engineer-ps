import { createServer, type ServerResponse } from "node:http";
import { readJsonBody, sendError, sendOptions, sendSuccess } from "./http.js";
import { Store } from "./store.js";
import { Runtime } from "./runtime.js";
import { APP_CONSTANTS } from "../shared/constants.js";
import { logEvent } from "./logger.js";

const store = new Store(
  process.env.DB_FILE ?? APP_CONSTANTS.server.defaultDatabaseFile,
);
const runtime = new Runtime(store);
const activeStreams = new Set<ServerResponse>();
const server = createServer(async (req, res) => {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const parts = url.pathname.split("/").filter(Boolean);
  if (req.method === "OPTIONS") {
    return sendOptions(res);
  }
  try {
    if (req.method === "POST" && url.pathname === APP_CONSTANTS.api.runsPath) {
      const b = await readJsonBody(req);
      const input = String(b.input ?? "");
      if (!input.trim()) return sendError(res, 400, "input is required");
      const count = Number(
        b.count ?? APP_CONSTANTS.server.defaultGeneratorChunkCount,
      );
      const delayMs = Number(
        b.delayMs ?? APP_CONSTANTS.server.defaultGeneratorDelayMs,
      );
      if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > APP_CONSTANTS.server.maxGeneratorChunkCount ||
        !Number.isFinite(delayMs) ||
        delayMs < 0
      )
        return sendError(res, 400, "invalid generation options");
      const run = runtime.start(
        String(b.conversationId ?? APP_CONSTANTS.server.defaultConversationId),
        input,
        {
          count,
          failAt: b.failAt === undefined ? undefined : Number(b.failAt),
          delayMs,
        },
      );
      return sendSuccess(res, 201, run);
    }
    if (
      req.method === "GET" &&
      parts[0] === "api" &&
      parts[1] === "runs" &&
      parts[3] === "events"
    ) {
      const run = store.getRun(parts[2]);
      if (!run) return sendError(res, 404, "run not found");
      const cursor = Number(url.searchParams.get("cursor") ?? 0);
      if (!Number.isInteger(cursor) || cursor < 0 || cursor >= run.nextSequence)
        return sendError(res, 400, "invalid cursor");
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      });
      activeStreams.add(res);
      logEvent("stream_connected", { runId: run.id, cursor });
      let sent = cursor;
      const send = () => {
        const events = store.eventsAfter(run.id, sent);
        for (const event of events) {
          res.write(
            `id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`,
          );
          sent = event.sequence;
        }
        const current = store.getRun(run.id);
        if (
          current &&
          current.state !== "running" &&
          sent >= current.nextSequence - 1
        ) {
          res.end();
          clearInterval(timer);
        }
      };
      const timer = setInterval(send, APP_CONSTANTS.server.eventPollIntervalMs);
      send();
      req.on("close", () => {
        clearInterval(timer);
        activeStreams.delete(res);
        logEvent("stream_disconnected", { runId: run.id, cursor: sent });
      });
      return;
    }
    if (req.method === "GET" && parts[0] === "api" && parts[1] === "runs") {
      const run = store.getRun(parts[2]);
      return run
        ? sendSuccess(res, 200, { run, events: store.eventsAfter(run.id, 0) })
        : sendError(res, 404, "run not found");
    }
    sendError(res, 404, "not found");
  } catch (error) {
    sendError(
      res,
      500,
      error instanceof Error ? error.message : "internal error",
    );
  }
});
const port = Number(process.env.PORT ?? APP_CONSTANTS.server.defaultPort);
server.listen(port, () => logEvent("server_started", { port }));

function shutdown(signal: string): void {
  logEvent("server_shutdown_started", { signal });
  for (const stream of activeStreams) stream.end();
  server.close(() => {
    store.close();
    logEvent("server_shutdown_completed");
    process.exit(0);
  });
  setTimeout(
    () => process.exit(1),
    APP_CONSTANTS.server.shutdownTimeoutMs,
  ).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
