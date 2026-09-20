import type { IncomingMessage, ServerResponse } from "node:http";

export type RequestBody = Record<string, string | number>;

export function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(payload));
}

export function sendSuccess(
  res: ServerResponse,
  status: number,
  data: unknown,
): void {
  sendJson(res, status, data);
}

export function sendError(
  res: ServerResponse,
  status: number,
  message: string,
): void {
  sendJson(res, status, { error: message });
}

export async function readJsonBody(req: IncomingMessage): Promise<RequestBody> {
  let value = "";
  for await (const chunk of req) value += chunk;
  return JSON.parse(value || "{}") as RequestBody;
}

export function sendOptions(res: ServerResponse): void {
  res.writeHead(204, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end();
}
