import { z } from "zod";
import { currentUser } from "@/lib/session";
import { getPrisma } from "@/lib/db";
import { AppError, toApiError } from "@/lib/errors";

const deleteBody = z.object({
  confirm: z.literal(true, { message: "Confirm account deletion with { confirm: true }." }),
});

export async function DELETE(req: Request) {
  try {
    const user = await currentUser();
    if (!user) throw new AppError("UNAUTHENTICATED", "Sign in to manage your account.");
    const prisma = getPrisma();
    if (!prisma) throw new AppError("SOURCE_UNAVAILABLE", "Database not configured.");

    const json = await req.json();
    const parsed = deleteBody.safeParse(json);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input");
    }

    await prisma.user.delete({ where: { id: user.id } });
    return Response.json({ ok: true, message: "Account deleted." });
  } catch (err) {
    const body = toApiError(err);
    return Response.json(body, { status: (err as AppError).status ?? 500 });
  }
}
