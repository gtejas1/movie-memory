import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function Onboarding() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (user?.favoriteMovie) redirect("/dashboard");

  // TODO: form + server action (validate with movieSchema, save, redirect to /dashboard)
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold">What is your favorite movie?</h1>
    </main>
  );
}
