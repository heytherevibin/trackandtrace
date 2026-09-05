import { z } from "zod";
import { Prisma } from "@prisma/client";
import { currentUser } from "@/lib/session";
import { getPrisma } from "@/lib/db";
import { AppError, toApiError } from "@/lib/errors";
import { isValidPnr } from "@/lib/engine";

const upsertBody = z.object({
  pnr: z.string().refine(isValidPnr, "A PNR is 10 digits and never starts with 0 or 1."),
  label: z.string().min(1).max(200),
  checks: z.unknown().optional(),
});

const deleteBody = z.object({
  pnr: z.string().refine(isValidPnr, "A PNR is 10 digits and never starts with 0 or 1."),
});

async function requireAuth() {
  const user = await currentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Sign in to access your watchlist.");
  const prisma = getPrisma();
  if (!prisma) throw new AppError("SOURCE_UNAVAILABLE", "Database not configured.");
  return { user, prisma };
}

export async function GET() {
  try {
    const { user, prisma } = await requireAuth();
    const entries = await prisma.watchlistEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ ok: true, data: entries });
  } catch (err) {
    const body = toApiError(err);
    return Response.json(body, { status: (err as AppError).status ?? 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { user, prisma } = await requireAuth();
    const json = await req.json();
    const parsed = upsertBody.safeParse(json);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { pnr, label, checks } = parsed.data;
    const entry = await prisma.watchlistEntry.upsert({
      where: { userId_pnr: { userId: user.id, pnr } },
      create: { userId: user.id, pnr, label, checks: checks ?? Prisma.DbNull },
      update: { label, checks: checks ?? undefined },
    });
    return Response.json({ ok: true, data: entry }, { status: 200 });
  } catch (err) {
    const body = toApiError(err);
    return Response.json(body, { status: (err as AppError).status ?? 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { user, prisma } = await requireAuth();
    const json = await req.json();
    const parsed = deleteBody.safeParse(json);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    await prisma.watchlistEntry.deleteMany({
      where: { userId: user.id, pnr: parsed.data.pnr },
    });
    return Response.json({ ok: true });
  } catch (err) {
    const body = toApiError(err);
    return Response.json(body, { status: (err as AppError).status ?? 500 });
  }
}
