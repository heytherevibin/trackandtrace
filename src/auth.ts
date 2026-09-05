import NextAuth from "next-auth";
import { env } from "@/lib/env";
import type { NextAuthConfig } from "next-auth";

const e = env();

function buildConfig(): NextAuthConfig | null {
  if (!e.AUTH_SECRET || !e.DATABASE_URL) return null;

  const providers: NextAuthConfig["providers"] = [];

  if (e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET) {
    const Google = require("next-auth/providers/google").default;
    providers.push(
      Google({
        clientId: e.AUTH_GOOGLE_ID,
        clientSecret: e.AUTH_GOOGLE_SECRET,
      })
    );
  }

  if (e.AUTH_EMAIL_SERVER && e.AUTH_EMAIL_FROM) {
    const Nodemailer = require("next-auth/providers/nodemailer").default;
    providers.push(
      Nodemailer({
        server: e.AUTH_EMAIL_SERVER,
        from: e.AUTH_EMAIL_FROM,
      })
    );
  }

  const { PrismaAdapter } = require("@auth/prisma-adapter");
  const { getPrisma } = require("@/lib/db");
  const prisma = getPrisma();

  return {
    adapter: prisma ? PrismaAdapter(prisma) : undefined,
    providers,
    session: { strategy: "database" },
    trustHost: true,
    pages: {
      signIn: "/login",
    },
  };
}

const config = buildConfig();

const noop = {
  handlers: {
    GET: async () =>
      Response.json(
        { ok: false, code: "SOURCE_UNAVAILABLE", message: "Auth not configured" },
        { status: 503 }
      ),
    POST: async () =>
      Response.json(
        { ok: false, code: "SOURCE_UNAVAILABLE", message: "Auth not configured" },
        { status: 503 }
      ),
  },
  auth: async () => null,
  signIn: async () => undefined,
  signOut: async () => undefined,
};

const instance = config ? NextAuth(config) : noop;

export const handlers = instance.handlers;
export const auth = instance.auth as () => Promise<import("next-auth").Session | null>;
export const signIn = instance.signIn;
export const signOut = instance.signOut;

export const authConfigured = config !== null;
