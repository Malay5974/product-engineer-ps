import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { createRun } from "./api.js";
import { APP_CONSTANTS } from "../../shared/constants.js";

type Event = { sequence: number; kind: string; payload: string };
type Activity = {
  id: string;
  level: "success" | "warning" | "error";
  text: string;
  time: string;
};
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  state: string;
};
type SavedSession = {
  conversationId: string;
  messages: Message[];
  events: Event[];
  runId: string;
  cursor: number;
  assistantId: string;
  status: string;
};
const SESSION_KEY = APP_CONSTANTS.storage.sessionKey;

function App() {
  const [input, setInput] = useState<string>(
    APP_CONSTANTS.conversation.defaultInput,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [status, setStatus] = useState("idle");
  const [runId, setRunId] = useState("");
  const [cursor, setCursor] = useState(0);
  const [failure, setFailure] = useState(false);
  const [chunkCount, setChunkCount] = useState<number>(
    APP_CONSTANTS.conversation.defaultChunkCount,
  );
  const [disconnectNotice, setDisconnectNotice] = useState("");
  const [activity, setActivity] = useState<Activity[]>([]);
  const conversationId = useRef<string>(crypto.randomUUID());
  const streamRef = useRef<EventSource | null>(null);
  const cursorRef = useRef(0);
  const activeAssistantId = useRef("");
  const historyRef = useRef<HTMLElement | null>(null);
  const restoredRef = useRef(false);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualDisconnect = useRef(false);

  function addActivity(level: Activity["level"], text: string): void {
    setActivity((current) => [
      ...current.slice(-7),
      {
        id: crypto.randomUUID(),
        level,
        text,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      },
    ]);
  }

  useEffect(() => {
    if (historyRef.current)
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
  }, [messages, disconnectNotice]);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(SESSION_KEY) ?? "null",
      ) as SavedSession | null;
      if (saved) {
        conversationId.current = saved.conversationId;
        activeAssistantId.current = saved.assistantId;
        setMessages(saved.messages);
        setEvents(saved.events);
        setRunId(saved.runId);
        setCursor(saved.cursor);
        cursorRef.current = saved.cursor;
        setStatus(
          saved.status === "completed" || saved.status === "failed"
            ? saved.status
            : "disconnected",
        );
        if (
          saved.runId &&
          saved.status !== "completed" &&
          saved.status !== "failed"
        )
          setTimeout(
            () => connect(saved.runId, saved.cursor, saved.assistantId),
            0,
          );
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
    restoredRef.current = true;
  }, []);
  useEffect(() => {
    if (restoredRef.current)
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          conversationId: conversationId.current,
          messages,
          events,
          runId,
          cursor,
          assistantId: activeAssistantId.current,
          status,
        } satisfies SavedSession),
      );
  }, [messages, events, runId, cursor, status]);

  function startNewConversation(): void {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    manualDisconnect.current = true;
    streamRef.current?.close();
    localStorage.removeItem(SESSION_KEY);
    conversationId.current = crypto.randomUUID();
    activeAssistantId.current = "";
    cursorRef.current = 0;
    setMessages([]);
    setEvents([]);
    setRunId("");
    setCursor(0);
    setStatus("idle");
    setDisconnectNotice("");
    setActivity([]);
    setInput(APP_CONSTANTS.conversation.defaultInput);
    addActivity("success", "Started a new conversation.");
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || status === "connecting" || status === "connected") return;
    streamRef.current?.close();
    manualDisconnect.current = false;
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    activeAssistantId.current = assistantId;
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", content, state: "sent" },
      { id: assistantId, role: "assistant", content: "", state: "streaming" },
    ]);
    setEvents([]);
    setCursor(0);
    cursorRef.current = 0;
    setInput("");
    setStatus("connecting");
    setDisconnectNotice("");
    addActivity("warning", "Starting the response stream…");
    try {
      const run = await createRun({
        conversationId: conversationId.current,
        input: content,
        count: chunkCount,
        failAt: failure ? Math.min(4, chunkCount - 1) : undefined,
        delayMs: APP_CONSTANTS.conversation.responseDelayMs,
      });
      setRunId(run.id);
      addActivity("success", "Response stream connected.");
      connect(run.id, 0, assistantId);
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, state: "failed" }
            : message,
        ),
      );
      setStatus("failed");
      setDisconnectNotice(
        error instanceof Error
          ? error.message
          : "Unable to start the response.",
      );
      addActivity("error", "Could not start the response.");
    }
  }

  function connect(
    id = runId,
    from = cursorRef.current,
    assistantId = activeAssistantId.current,
  ) {
    if (!id) return;
    streamRef.current?.close();
    manualDisconnect.current = false;
    setStatus("connected");
    setDisconnectNotice("");
    addActivity(
      from > 0 ? "success" : "warning",
      from > 0
        ? `Recovering from saved cursor ${from}…`
        : "Listening for response events…",
    );
    const stream = new EventSource(APP_CONSTANTS.api.eventsPath(id, from));
    streamRef.current = stream;
    stream.onmessage = (message) => {
      const event = JSON.parse(message.data) as Event;
      setEvents((current) =>
        current.some((item) => item.sequence === event.sequence)
          ? current
          : [...current, event],
      );
      cursorRef.current = Math.max(cursorRef.current, event.sequence);
      setCursor(cursorRef.current);
      if (event.kind === "chunk" && assistantId)
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId
              ? { ...item, content: `${item.content}${event.payload} ` }
              : item,
          ),
        );
      if (
        event.kind === "run_completed" ||
        event.kind === "run_failed" ||
        event.kind === "run_interrupted"
      ) {
        const completed = event.kind === "run_completed";
        const interrupted = event.kind === "run_interrupted";
        setStatus(completed ? "completed" : "failed");
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId
              ? { ...item, state: completed ? "completed" : "failed" }
              : item,
          ),
        );
        if (interrupted)
          setDisconnectNotice(
            "Response interrupted because the server restarted.",
          );
        addActivity(
          completed ? "success" : "error",
          completed
            ? "Response completed successfully."
            : interrupted
              ? "Response was interrupted by a server restart."
              : "Response failed after partial output.",
        );
        stream.close();
        reconnectAttempt.current = 0;
      }
    };
    stream.onerror = () => {
      stream.close();
      if (manualDisconnect.current) return;
      const attempt = reconnectAttempt.current + 1;
      reconnectAttempt.current = attempt;
      if (attempt > APP_CONSTANTS.reconnect.maxAttempts) {
        setStatus("disconnected");
        setDisconnectNotice("Connection lost. Reconnect to continue.");
        return;
      }
      const delay = Math.min(
        APP_CONSTANTS.reconnect.maxDelayMs,
        APP_CONSTANTS.reconnect.initialDelayMs * 2 ** (attempt - 1),
      );
      setStatus("reconnecting");
      setDisconnectNotice(`Connection lost. Reconnecting in ${delay / 1000}s…`);
      addActivity("warning", `Connection lost. Retrying in ${delay / 1000}s…`);
      reconnectTimer.current = setTimeout(
        () => connect(id, cursorRef.current, assistantId),
        delay,
      );
    };
    stream.addEventListener("server_shutdown", () => {
      stream.close();
      manualDisconnect.current = true;
      setStatus("disconnected");
      setDisconnectNotice(
        "Server stopped. Reconnect when the server is available again.",
      );
      addActivity("warning", "Server stopped. Waiting for manual recovery.");
    });
  }

  return (
    <main>
      <header>
        <div className="header-row">
          <h1>Resumable conversation</h1>
          <button className="secondary-button" onClick={startNewConversation}>
            New conversation
          </button>
        </div>
        <p className="hint">
          A multi-turn AI conversation with durable streaming and cursor-based
          recovery.
        </p>
      </header>
      <section ref={historyRef} className="history">
        {messages.length === 0 && !disconnectNotice && (
          <p className="empty">Send a message to start the conversation.</p>
        )}
        {messages.map((message) => (
          <article className={`message ${message.role}`} key={message.id}>
            <strong>{message.role === "user" ? "You" : "Assistant"}</strong>
            <p>{message.content || "Generating response…"}</p>
            {message.state === "failed" && (
              <small>Response failed after partial output.</small>
            )}
          </article>
        ))}
        {disconnectNotice && (
          <p className="disconnect-note" role="status">
            {disconnectNotice}
          </p>
        )}
      </section>
      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
            void sendMessage();
        }}
        placeholder="Write a message…"
      />
      <div className="controls">
        <label className="count-control">
          Response chunks{" "}
          <input
            type="number"
            min={APP_CONSTANTS.conversation.minChunkCount}
            max={APP_CONSTANTS.conversation.maxChunkCount}
            value={chunkCount}
            onChange={(event) =>
              setChunkCount(
                Math.max(
                  APP_CONSTANTS.conversation.minChunkCount,
                  Math.min(
                    APP_CONSTANTS.conversation.maxChunkCount,
                    Number(event.target.value) ||
                      APP_CONSTANTS.conversation.minChunkCount,
                  ),
                ),
              )
            }
            disabled={status === "connecting" || status === "connected"}
          />
        </label>
        <label className="failure">
          <input
            type="checkbox"
            checked={failure}
            onChange={(event) => setFailure(event.target.checked)}
          />{" "}
          Simulate provider failure for the next reply
        </label>
      </div>
      <div>
        <button
          onClick={() => void sendMessage()}
          disabled={
            !input.trim() || status === "connecting" || status === "connected"
          }
        >
          Send message
        </button>
        <button
          onClick={() => {
            manualDisconnect.current = true;
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            streamRef.current?.close();
            setStatus("disconnected");
            setDisconnectNotice("Connection lost. Reconnect to continue.");
            addActivity("error", "Disconnected manually.");
          }}
          disabled={!runId || status !== "connected"}
        >
          Disconnect
        </button>
        <button
          onClick={() => connect()}
          disabled={!runId || status !== "disconnected"}
        >
          Reconnect from cursor
        </button>
      </div>
      <p className="status">
        Status: <strong>{status}</strong> · last event cursor: {cursor}
      </p>
      <small>
        {events.length} events in current reply · {chunkCount} response chunks
        requested · conversation {conversationId.current.slice(0, 8)}
      </small>
      <section
        className="activity"
        aria-label="Activity log"
        aria-live="polite"
      >
        <div className="activity-header">
          <div>
            <strong>Activity</strong>
            <span>Connection and recovery events</span>
          </div>
          <span className={`activity-status ${status}`}>
            <span className="activity-dot" aria-hidden="true" />
            {status}
          </span>
        </div>
        {activity.length === 0 ? (
          <span className="activity-empty">No activity yet.</span>
        ) : (
          [...activity].reverse().map((item) => (
            <div className="activity-item" key={item.id}>
              <span
                className={`activity-dot ${item.level}`}
                aria-hidden="true"
              />
              <span>{item.text}</span>
              <time>{item.time}</time>
            </div>
          ))
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
