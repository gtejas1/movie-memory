import { FactGenerationError, getFact } from "@/utils/facts";

/** Async server component, rendered inside Suspense so the page does not block on OpenAI. */
export async function FunFact({ userId, movie }: { userId: string; movie: string }) {
  try {
    const fact = await getFact(userId, movie);
    return (
      <div className="space-y-1">
        <p className="text-lg leading-relaxed">{fact.content}</p>
        {fact.source === "stale-fallback" && (
          <p className="text-sm text-neutral-500">
            Showing a previously saved fact; a fresh one could not be generated.
          </p>
        )}
      </div>
    );
  } catch (error) {
    const message =
      error instanceof FactGenerationError ? error.message : "Something went wrong. Please try again.";
    return <p className="text-red-400">{message}</p>;
  }
}
