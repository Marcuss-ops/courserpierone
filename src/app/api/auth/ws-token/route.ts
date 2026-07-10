import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";
import { createHmac } from "crypto";

/**
 * GET /api/auth/ws-token
 *
 * Generates a short-lived token for WebSocket authentication.
 * Format: userId:timestamp:signature
 * Expires after 5 minutes.
 *
 * The WebSocket server (server.ts) verifies:
 * 1. Timestamp is within 5 minutes
 * 2. Signature matches (using WS_SECRET)
 */
export async function GET() {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const secret = process.env.WS_SECRET ?? "dev-secret-change-in-production";
  const timestamp = Date.now();
  const payload = `${dbUser.id}:${timestamp}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);

  const token = `${dbUser.id}:${timestamp}:${signature}`;

  return NextResponse.json({ token, userId: dbUser.id });
}
