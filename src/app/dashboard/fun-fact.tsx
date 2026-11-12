import { FactGenerationError, generateFact } from "@/lib/facts";

/** Async server component, rendered inside Suspense so the page does not block on OpenAI. */
export async function FunFact({ userId, movie }: { userId: string; movie: string }) {
  try {
    const fact = await generateFact(userId, movie);
    return <p className="text-lg leading-relaxed">{fact.content}</p>;
  } catch (error) {
    const message =
      error instanceof FactGenerationError ? error.message : "Something went wrong. Please try again.";
    return <p className="text-red-400">{message}</p>;
  }
}
