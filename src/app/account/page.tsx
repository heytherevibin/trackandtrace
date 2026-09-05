import { currentUser } from "@/lib/session";
import { AccountBody } from "./account-body";

export default async function AccountPage() {
  const user = await currentUser();
  return <AccountBody user={user} />;
}
