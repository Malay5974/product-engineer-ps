export async function* fakeResponse(
  input: string,
  options: { count?: number; failAt?: number; delayMs?: number } = {},
): AsyncGenerator<string> {
  const count = options.count ?? 12;
  for (let i = 0; i < count; i++) {
    if (options.failAt === i) throw new Error("deterministic provider failure");
    if (options.delayMs)
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    yield `${input} · response chunk ${i + 1}`;
  }
}
