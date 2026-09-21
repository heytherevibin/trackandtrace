import { Badge } from "@/components/ui/badge";
import { KeyValueList } from "@/components/ui/key-value-list";
import { Plate } from "@/components/ui/plate";
import type { MyKeysProfile } from "@/console/account/my-keys";
import { consoleMessages } from "@/console/messages";
import { formatDate } from "@/utils/datetime";

const m = consoleMessages.myKeys;
const f = consoleMessages.frame;

/**
 * The Profile plate and, for an Owner only, the "If you lose your keys" note beneath it
 * (ConsoleMyKeys.dc.html's own `isOwner` gate). The two are kept in one component/file rather than
 * split further (task-6-addendum.md §2 invites this for the Profile plate; the lost-keys note is
 * small enough, and grouped with Profile in the sheet's own left-hand column, to travel with it).
 *
 * These two are the sheet's left-hand column. Sessions -- the right-hand one beside them -- was a
 * later task when this file was written and is now built (src/console/account/sessions-plate.tsx);
 * the two-column grid the sheet draws lives in the page (src/app/console/keys/page.tsx), so this
 * component still renders one stacked column of its own and lets the page place it.
 */
export function ProfilePlate({ member }: { readonly member: MyKeysProfile }) {
  const roleLabel = f.roleLabel[member.role];
  return (
    <>
      <Plate as="section" title={m.profileTitle} titleId="mk-profile" headingLevel={2} padding="none">
        <KeyValueList
          className="px-5 pt-1 pb-2"
          items={[
            { label: m.profile.name, value: member.name },
            { label: m.profile.email, value: member.email },
            { label: m.profile.role, value: <Badge variant="steel" caps>{roleLabel}</Badge> },
            { label: m.profile.memberSince, value: formatDate(member.createdAt) },
          ]}
        />
      </Plate>
      {member.role === "owner" ? (
        <Plate as="section" title={m.lostTitle} titleId="mk-lost" headingLevel={2} padding="none">
          <p className="px-5 py-3.5 text-sm text-ink-2">{m.lostNote}</p>
        </Plate>
      ) : null}
    </>
  );
}
