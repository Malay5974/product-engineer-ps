export type RunState = "running" | "completed" | "failed" | "interrupted";
export type EventKind =
  "run_started" | "chunk" | "run_completed" | "run_failed" | "run_interrupted";

export interface ConversationEvent {
  id: string;
  runId: string;
  sequence: number;
  kind: EventKind;
  payload: string;
  createdAt: string;
}
export interface Run {
  id: string;
  conversationId: string;
  userMessageId: string;
  input: string;
  state: RunState;
  nextSequence: number;
  createdAt: string;
}
