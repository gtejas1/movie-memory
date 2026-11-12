import { redirect } from "next/navigation";
import { requireUser } from "@/lib/current-user";
import { MovieForm } from "./movie-form";

export default async function Onboarding() {
  const user = await requireUser();
  if (user.favoriteMovie) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-semibold">What is your favorite movie?</h1>
      <MovieForm />
    </main>
  );
}
