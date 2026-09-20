export type CreateRunInput = {
  conversationId: string;
  input: string;
  count: number;
  failAt?: number;
  delayMs: number;
};

export type RunResponse = { id: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type JsonRequestOptions = RequestInit & {
  validate?: (value: unknown) => boolean;
};

/** The only JSON HTTP entry point used by the client. */
export async function requestJson<T>(
  path: string,
  options: JsonRequestOptions = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, options);
  } catch {
    throw new ApiError("The server could not be reached.", 0);
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(
      "The server returned an invalid JSON response.",
      response.status,
    );
  }

  const errorMessage =
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof result.error === "string"
      ? result.error
      : "The request failed.";

  if (!response.ok) throw new ApiError(errorMessage, response.status);
  if (options.validate && !options.validate(result)) {
    throw new ApiError(
      "The server returned an invalid response.",
      response.status,
    );
  }

  return result as T;
}

function isRunResponse(value: unknown): value is RunResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0
  );
}

export function createRun(payload: CreateRunInput): Promise<RunResponse> {
  return requestJson<RunResponse>(APP_CONSTANTS.api.runsPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    validate: isRunResponse,
  });
}
import { APP_CONSTANTS } from "../../shared/constants.js";
