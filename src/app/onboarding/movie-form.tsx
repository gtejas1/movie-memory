"use client";

import { useActionState } from "react";
import { saveFavoriteMovie, type OnboardingState } from "./actions";

const initialState: OnboardingState = {};

export function MovieForm() {
  const [state, formAction, isPending] = useActionState(saveFavoriteMovie, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input
        name="movie"
        required
        maxLength={100}
        placeholder="e.g. The Matrix"
        className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2"
      />
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button
        disabled={isPending}
        className="rounded-md bg-white px-4 py-2 font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Continue"}
      </button>
    </form>
  );
}
