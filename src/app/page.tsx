import { redirect } from "next/navigation";
import { auth } from "@/config/auth";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

export default async function Landing() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-4xl font-bold">Movie Memory</h1>
      <p className="text-neutral-400">Fun facts about your favorite movie.</p>
      <GoogleSignInButton />
    </main>
  );
}
