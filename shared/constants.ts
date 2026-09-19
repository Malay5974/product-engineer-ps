export const APP_CONSTANTS = {
  api: {
    runsPath: "/api/runs",
    eventsPath: (runId: string, cursor: number) =>
      `/api/runs/${runId}/events?cursor=${cursor}`,
  },
  conversation: {
    defaultInput: "Hello from a resilient conversation",
    defaultChunkCount: 12,
    minChunkCount: 1,
    maxChunkCount: 100,
    responseDelayMs: 250,
  },
  server: {
    defaultPort: 3000,
    defaultDatabaseFile: "./conversation.db",
    defaultConversationId: "demo",
    defaultGeneratorDelayMs: 100,
    defaultGeneratorChunkCount: 12,
    maxGeneratorChunkCount: 100,
    eventPollIntervalMs: 50,
  },
  storage: { sessionKey: "caygnus-resumable-conversation" },
} as const;
