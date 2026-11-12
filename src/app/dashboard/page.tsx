import Image from "next/image";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/current-user";
import { FunFact } from "./fun-fact";

export default async function Dashboard() {
  const user = await requireUser();
  if (!user.favoriteMovie) redirect("/onboarding");

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6">
      <header className="flex items-center gap-4">
        {user.image ? (
          <Image src={user.image} alt="" width={48} height={48} className="rounded-full" />
        ) : (
          <div className="size-12 rounded-full bg-neutral-700" />
        )}
        <div>
          <p className="font-medium">{user.name ?? "Movie fan"}</p>
          <p className="text-sm text-neutral-400">{user.email}</p>
        </div>
        <form
          className="ml-auto"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800">
            Log out
          </button>
        </form>
      </header>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-neutral-400">Favorite movie</h2>
        <p className="text-xl">{user.favoriteMovie}</p>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-neutral-400">Fun fact</h2>
        <Suspense fallback={<p className="text-neutral-500">Thinking up a fact...</p>}>
          <FunFact userId={user.id} movie={user.favoriteMovie} />
        </Suspense>
      </section>
    </main>
  );
}
