import { redirect } from "next/navigation";
import { consoleHref } from "@/console/href";

/** The console's home. Until sessions exist (plan 2c) it is the sign-in page. */
export default function ConsoleHome(): never {
  redirect(consoleHref("/login"));
}
