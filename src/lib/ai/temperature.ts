/** GPT-6 Luna defaults to reasoning, where custom sampling is unsupported. */
export function requestTemperature(provider: string, model: string, temperature: number): number | undefined {
  return provider === "openai" && model === "gpt-6-luna" ? undefined : temperature;
}
