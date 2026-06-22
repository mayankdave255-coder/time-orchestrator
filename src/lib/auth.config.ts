// src/lib/auth.config.ts
//
// Edge-safe subset of the NextAuth config. src/middleware.ts runs in the
// Edge runtime and only ever needs to verify an existing session JWT —
// it never runs authorize() — so it builds its own NextAuth instance from
// just this config. src/lib/auth.ts spreads this and adds the Credentials
// provider (which pulls in bcryptjs, a Node-only dependency) for
// everywhere else: API routes and other Node-runtime code.
import type { NextAuthConfig } from "next-auth";

export default {
  providers: [],

  session: {
    strategy: "jwt",
  },

  secret: process.env.AUTH_SECRET,

  pages: {
    signIn: "/auth/signin",
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
