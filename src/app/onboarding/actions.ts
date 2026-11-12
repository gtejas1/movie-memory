"use server";

import { redirect } from "next/navigation";
import { auth } from "@/config/auth";
import { prisma } from "@/config/prisma";
import { movieSchema } from "@/utils/validation";

export type OnboardingState = { error?: string };

export async function saveFavoriteMovie(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  // Server-side validation: trims, then enforces min/max length.
  const parsed = movieSchema.safeParse(formData.get("movie"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.user.update({
    where: { id: session.user.id },
    data: { favoriteMovie: parsed.data },
  });

  redirect("/dashboard");
}
