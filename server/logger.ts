type LogFields = Record<string, string | number | boolean | undefined>;

export function logEvent(event: string, fields: LogFields = {}): void {
  console.info(
    JSON.stringify({ at: new Date().toISOString(), event, ...fields }),
  );
}
