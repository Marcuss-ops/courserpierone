import NextAuth, { type NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "../db/prisma";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";

// Warn if NEXTAUTH_SECRET is the default dev value (skip during build to keep logs clean)
if (
  process.env.NEXT_PHASE !== "phase-production-build" &&
  (!process.env.NEXTAUTH_SECRET ||
    process.env.NEXTAUTH_SECRET === "dev-secret-change-in-production-1234567890" ||
    process.env.NEXTAUTH_SECRET === "change-me-to-a-random-secret")
) {
  console.warn(
    "⚠️  NEXTAUTH_SECRET non configurato o è quello di default! " +
      "Generane uno con: openssl rand -base64 32"
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST ?? "smtp.gmail.com",
        port: parseInt(process.env.EMAIL_SERVER_PORT || "587"),
        auth: {
          user: process.env.EMAIL_SERVER_USER ?? "",
          pass: process.env.EMAIL_SERVER_PASSWORD ?? "",
        },
      },
      from: process.env.EMAIL_FROM ?? "noreply@courser.app",
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/magic-link",
  },
  session: {
    strategy: "jwt" as const,
  },
  callbacks: {
    session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.sub!;
        session.user.role = token.role!;
      }
      return session;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
  },
};

export default NextAuth(authOptions);
