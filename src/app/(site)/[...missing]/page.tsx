import { notFound } from "next/navigation";

/** Unmatched traveller addresses show the site's not-found page, inside the site's layout (there is no app-wide root layout). */
export default function Missing(): never {
  notFound();
}
