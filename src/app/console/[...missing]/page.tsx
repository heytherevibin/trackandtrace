import { redirect } from "next/navigation";
import { consoleHref } from "@/console/href";

/** Unknown console addresses go to sign in. Plan 2d gives signed-in members a not-found state. */
export default function ConsoleMissing(): never {
  redirect(consoleHref("/login"));
}
