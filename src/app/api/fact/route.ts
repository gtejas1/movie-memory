import { NextResponse } from "next/server";
import { auth } from "@/config/auth";
import { FactGenerationError, getFact } from "@/utils/facts";
import { prisma } from "@/config/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.favoriteMovie) {
    return NextResponse.json({ error: "Set a favorite movie first" }, { status: 409 });
  }

  try {
    const { cached, ...fact } = await getFact(user.id, user.favoriteMovie);
    return NextResponse.json({ fact, cached });
  } catch (error) {
    const message = error instanceof FactGenerationError ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
