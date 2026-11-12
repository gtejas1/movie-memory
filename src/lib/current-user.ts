import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Returns the signed-in user from the DB, or redirects to the landing page. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/");

  return user;
}
