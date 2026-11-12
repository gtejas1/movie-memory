import OpenAI from "openai";

// Server-only: never import this from a client component.
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 10_000,
  maxRetries: 1,
});

export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
