import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function Landing() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-4xl font-bold">Movie Memory</h1>
      <p className="text-neutral-400">Fun facts about your favorite movie.</p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/dashboard" });
        }}
      >
        <button className="rounded-lg bg-white px-5 py-2.5 font-medium text-black hover:bg-neutral-200">
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
