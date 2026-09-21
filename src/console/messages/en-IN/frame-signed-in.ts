import type { MessageTree } from "@/messages/types";

// The signed-in frame's own new copy (Main.dc.html): the masthead clock's legend, the rail's
// landmark and group legends, the member menu's one item that isn't already in ./frame.ts (Sign
// out, roleLabel), and the rail footer's build line. Group keys match ConsoleGroupKey
// (src/console/nav.ts). "IST" is kept here rather than reused from @/messages' own common.ist:
// the console never imports the traveller message tree (tests/unit/console/boundary.contract.test.ts
// checks the other direction, but every other piece of console copy already lives under this tree
// too -- one console-owned home for it, not two trees for the same three letters).
export const frameSignedIn = {
  clock: {
    ist: "IST",
  },
  nav: {
    landmark: "Console",
    // The phone rail's trigger (ShellPhone.dc.html and ConsoleMyKeysPhone.dc.html's own hamburger
    // button, both `aria-label="Open menu"` word for word). Kept in this tree rather than reusing
    // messages.shell.nav.openMenu (the site's own, identical string for its own nav sheet): the
    // console never imports the traveller message tree (see this file's own top-of-file note).
    openMenu: "Open menu",
    groupLabel: {
      operate: "Operate",
      people: "People",
      queues: "Queues",
      configure: "Configure",
      record: "Record",
    },
  },
  member: {
    myKeys: "My keys",
    openMenu: (name: string, role: string) => `${name}, ${role}. Open the member menu`,
  },
  build: {
    // Local development, and any deployment missing either half: never fabricate one (task-4-addendum.md §2).
    unknown: "Build dev",
    line: (sha: string, date: string) => `Build ${sha} · ${date}`,
  },
} as const satisfies MessageTree;
