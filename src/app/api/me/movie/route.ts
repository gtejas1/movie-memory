import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function PUT() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // TODO: validate with movieSchema, update session.user.id's favoriteMovie
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
