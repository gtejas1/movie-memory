import { NextResponse } from "next/server";
import { auth } from "@/config/auth";
import { prisma } from "@/config/prisma";
import { movieSchema } from "@/utils/validation";

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = movieSchema.safeParse(body?.movie);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // Scoped to the session user id: callers can only ever update themselves.
  await prisma.user.update({ where: { id: session.user.id }, data: { favoriteMovie: parsed.data } });
  return NextResponse.json({ movie: parsed.data });
}
