import type { MessageTree } from "@/messages/types";

// The signed-in frame's own new copy (Main.dc.html): the rail's landmark and group legends, the
// member menu's one item that isn't already in ./frame.ts (Sign out, roleLabel), and the rail
// footer's build line. Group keys match ConsoleGroupKey (src/console/nav.ts).
export const frameSignedIn = {
  nav: {
    landmark: "Console",
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
