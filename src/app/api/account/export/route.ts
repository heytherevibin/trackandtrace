import { currentUser } from "@/lib/session";
import { getPrisma } from "@/lib/db";
import { AppError, toApiError } from "@/lib/errors";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) throw new AppError("UNAUTHENTICATED", "Sign in to export your data.");
    const prisma = getPrisma();
    if (!prisma) throw new AppError("SOURCE_UNAVAILABLE", "Database not configured.");

    const [profile, watchlist, analyses] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, email: true, createdAt: true } }),
      prisma.watchlistEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      prisma.analysis.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      profile,
      watchlist,
      analyses,
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="trackandtrace-export.json"',
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const body = toApiError(err);
    return Response.json(body, { status: (err as AppError).status ?? 500 });
  }
}
