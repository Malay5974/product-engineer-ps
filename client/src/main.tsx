import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { createRun } from "./api.js";
import { APP_CONSTANTS } from "../../shared/constants.js";

type Event = { sequence: number; kind: string; payload: string };
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
  const conversationId = useRef<string>(crypto.randomUUID());
  const streamRef = useRef<EventSource | null>(null);
  const cursorRef = useRef(0);
  const activeAssistantId = useRef("");
  const historyRef = useRef<HTMLElement | null>(null);
  const restoredRef = useRef(false);

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

  async function sendMessage() {
    const content = input.trim();
    if (!content || status === "connecting" || status === "connected") return;
    streamRef.current?.close();
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
    try {
      const run = await createRun({
        conversationId: conversationId.current,
        input: content,
        count: chunkCount,
        failAt: failure ? Math.min(4, chunkCount - 1) : undefined,
        delayMs: APP_CONSTANTS.conversation.responseDelayMs,
      });
      setRunId(run.id);
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
    }
  }

  function connect(
    id = runId,
    from = cursorRef.current,
    assistantId = activeAssistantId.current,
  ) {
    if (!id) return;
    streamRef.current?.close();
    setStatus("connected");
    setDisconnectNotice("");
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
      if (event.kind === "run_completed" || event.kind === "run_failed") {
        const completed = event.kind === "run_completed";
        setStatus(completed ? "completed" : "failed");
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId
              ? { ...item, state: completed ? "completed" : "failed" }
              : item,
          ),
        );
        stream.close();
      }
    };
    stream.onerror = () => {
      stream.close();
      setStatus("disconnected");
      setDisconnectNotice("Connection lost. Reconnect to continue.");
    };
  }

  return (
    <main>
      <header>
        <h1>Resumable conversation</h1>
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
            streamRef.current?.close();
            setStatus("disconnected");
            setDisconnectNotice("Connection lost. Reconnect to continue.");
          }}
          disabled={!runId || status !== "connected"}
        >
          Disconnect
        </button>
        <button
          onClick={() => connect()}
          disabled={!runId || status === "completed" || status === "failed"}
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
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
