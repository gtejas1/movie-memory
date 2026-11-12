import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // TODO: return user profile + favorite movie
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
