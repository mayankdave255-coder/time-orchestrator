import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";

// Built from the edge-safe base config (no Credentials/bcryptjs — see
// src/lib/auth.config.ts) rather than importing `auth` from
// src/lib/auth.ts, since middleware runs in the Edge runtime and that
// file's Credentials provider pulls in bcryptjs, which uses Node-only
// APIs (setImmediate/process.nextTick) the Edge runtime doesn't support.
// This instance only ever verifies an existing session JWT.
const { auth } = NextAuth(authConfig);

// Gates the data API routes behind a session. Anything not listed in
// `matcher` below (notably /api/auth/* — NextAuth's own handlers plus
// /api/auth/register) is skipped entirely, since those need to be
// reachable while signed out.
export default auth((req) => {
  if (!req.auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/api/rules/:path*",
    "/api/todos/:path*",
    "/api/schedule/:path*",
    "/api/schedule-range/:path*",
    "/api/exceptions/:path*",
    "/api/completions/:path*",
  ],
};
