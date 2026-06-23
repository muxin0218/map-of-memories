import { NextResponse, type NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authError = requireAdminSession(request);
  if (authError) return authError;

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const target = payload.target === "admin" ? "admin" : payload.target === "site" ? "site" : null;
  const newPassword = typeof payload.newPassword === "string" ? payload.newPassword.trim() : "";

  if (!target) {
    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  }
  if (newPassword.length < 1 || newPassword.length > 64) {
    return NextResponse.json({ error: "Password length must be 1-64" }, { status: 400 });
  }

  // Update the running server process environment (lasts until restart).
  // For permanent password changes, configure SITE_PASSWORD and ADMIN_PASSWORD in .env.local.
  if (target === "site") {
    process.env.SITE_PASSWORD = newPassword;
  } else {
    process.env.ADMIN_PASSWORD = newPassword;
  }

  return NextResponse.json({ ok: true });
}
