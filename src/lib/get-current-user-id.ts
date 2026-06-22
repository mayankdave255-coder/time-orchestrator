// src/lib/get-current-user-id.ts
//
// Stub for resolving "who is making this request" inside API routes.
//
// The real `auth()` export from "@/lib/auth" (NextAuth.js v5) is not yet
// usable here: no providers are configured, so it would resolve to a null
// session for every request, and every route below would 401. Rather than
// wire routes against an auth() call that can't succeed yet, this stub
// stands in for it so the API surface is exercisable today.
//
// TODO: once at least one auth provider is configured on `auth()`, replace
// getCurrentUserId's body with a real session lookup, e.g.:
//   const session = await auth();
//   return session?.user?.id ?? null;
// and update callers to handle the null case (401) for real.

const DEV_STUB_USER_ID = 'dev-user-1';

export async function getCurrentUserId(): Promise<string | null> {
  return DEV_STUB_USER_ID;
}
