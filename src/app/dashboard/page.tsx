import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FunFact } from "@/components/dashboard/fun-fact";
import { Section } from "@/components/dashboard/section";
import { UserHeader } from "@/components/dashboard/user-header";
import { requireUser } from "@/utils/current-user";

export default async function Dashboard() {
  const user = await requireUser();
  if (!user.favoriteMovie) redirect("/onboarding");

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6">
      <UserHeader name={user.name} email={user.email} image={user.image} />

      <Section title="Favorite movie">
        <p className="text-xl">{user.favoriteMovie}</p>
      </Section>

      <Section title="Fun fact">
        <Suspense fallback={<p className="text-neutral-500">Thinking up a fact...</p>}>
          <FunFact userId={user.id} movie={user.favoriteMovie} />
        </Suspense>
      </Section>
    </main>
  );
}
