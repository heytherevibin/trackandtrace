import { redirect } from "next/navigation";
import { requireConsoleMember } from "@/console/auth/guard";
import { SignedOutFrame } from "@/console/components/signed-out-frame";
import { consoleHref } from "@/console/href";
import { SignedIn } from "./signed-in";

export const dynamic = "force-dynamic";

/**
 * The console's home. Plan 2d replaces this with the drawn frame and Overview; for now it is the
 * proof that the sign-in journey ends somewhere a member can see.
 */
export default async function ConsoleHome() {
  const member = await requireConsoleMember().catch(() => null);
  if (!member) redirect(consoleHref("/login"));
  return (
    <SignedOutFrame>
      <SignedIn name={member.name} role={member.role} />
    </SignedOutFrame>
  );
}
