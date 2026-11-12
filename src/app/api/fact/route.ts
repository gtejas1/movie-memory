import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { FactGenerationError, generateFact } from "@/lib/facts";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.favoriteMovie) {
    return NextResponse.json({ error: "Set a favorite movie first" }, { status: 409 });
  }

  try {
    const fact = await generateFact(user.id, user.favoriteMovie);
    return NextResponse.json({ fact: { content: fact.content, createdAt: fact.createdAt } });
  } catch (error) {
    const message = error instanceof FactGenerationError ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
