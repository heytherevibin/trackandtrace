import { Plate } from "@/components/ui/plate";
import { consoleMessages } from "@/console/messages";
import { cn } from "@/utils/cn";

const m = consoleMessages.team.roles;
const f = consoleMessages.frame;

type AccessLevel = "full" | "half" | "none";
const ROLES = ["owner", "admin", "support", "viewer"] as const;

/**
 * ConsoleTeam.dc.html:168's own module-by-role grid, transcribed by hand: the plan's own file
 * structure table calls this plate "static copy", and it draws a legend/matrix
 * (`<table style="…">`, not the `.dt` DataTable class Members and Invites use), not a list of
 * records with row actions -- so it is built as a plain semantic table here rather than stretched
 * onto the shared DataTable component. Cross-checked against src/console/nav.ts's own CONSOLE_MODULES
 * role sets (OWNER_ONLY, OWNER_ADMIN, OWNER_ADMIN_SUPPORT, OWNER_ADMIN_VIEWER, EVERY_ROLE): every
 * module that is "none" for a role here is exactly the set nav.ts already keeps that role from
 * seeing in the rail, and every "full" or "half" module is exactly the set it lets them see --
 * Task 8 still checks the map again before flipping Team's own `built` flag
 * (docs/superpowers/plans/2026-09-22-phase-2d2-team.md's own pre-flight note), rather than trusting
 * this cross-check alone.
 */
const MODULES: readonly { readonly label: string; readonly access: Readonly<Record<(typeof ROLES)[number], AccessLevel>> }[] = [
  { label: "01 Overview", access: { owner: "full", admin: "full", support: "full", viewer: "half" } },
  { label: "02 Sources & usage", access: { owner: "full", admin: "full", support: "none", viewer: "half" } },
  { label: "03 Status & incidents", access: { owner: "full", admin: "full", support: "none", viewer: "half" } },
  { label: "04 Abuse & limits", access: { owner: "full", admin: "full", support: "none", viewer: "none" } },
  { label: "05 Alerts", access: { owner: "full", admin: "full", support: "none", viewer: "none" } },
  { label: "06 Leads", access: { owner: "full", admin: "full", support: "full", viewer: "none" } },
  { label: "07 Announcements", access: { owner: "full", admin: "full", support: "none", viewer: "none" } },
  { label: "08 Accounts", access: { owner: "full", admin: "full", support: "none", viewer: "none" } },
  { label: "09 Privacy requests", access: { owner: "full", admin: "full", support: "full", viewer: "none" } },
  { label: "10 Wrong-status reports", access: { owner: "full", admin: "full", support: "full", viewer: "none" } },
  { label: "11 Switches & settings", access: { owner: "full", admin: "full", support: "none", viewer: "none" } },
  { label: "12 Provider keys", access: { owner: "full", admin: "none", support: "none", viewer: "none" } },
  { label: "13 Team", access: { owner: "full", admin: "none", support: "none", viewer: "none" } },
  { label: "14 Audit log", access: { owner: "full", admin: "full", support: "none", viewer: "none" } },
  { label: "My keys", access: { owner: "full", admin: "full", support: "full", viewer: "full" } },
] as const;

/** ConsoleTeam.dc.html's own `.sq full/half/none`: a small square, decorative beside visible legend text, or self-describing via `role="img"` inside the grid where no visible text sits next to it. */
function AccessSquare({ level, label }: { readonly level: AccessLevel; readonly label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={cn(
        "relative inline-block size-[10px] shrink-0 overflow-hidden border border-line-strong",
        level !== "none" && "border-ink-1",
        level === "full" && "bg-ink-1",
        level === "half" && "before:absolute before:inset-y-0 before:left-0 before:w-1/2 before:bg-ink-1",
      )}
    />
  );
}

/** The Roles plate (ConsoleTeam.dc.html): what each role can reach, static copy carrying no props. */
export function RolesPlate() {
  return (
    <Plate as="section" title={m.title} titleId="team-roles" headingLevel={2} meta={[m.moduleCount]} padding="none">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{m.tableCaption}</caption>
          <thead>
            <tr>
              <th scope="col" className="legend px-3.5 py-2 text-left font-normal">
                {m.columns.module}
              </th>
              {ROLES.map((role) => (
                <th key={role} scope="col" className="legend h-9 w-[110px] border-b border-line text-center font-normal">
                  {f.roleLabel[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="h-[34px] whitespace-nowrap border-b border-line px-3.5 text-left text-sm font-normal text-ink-1">
                  {row.label}
                </th>
                {ROLES.map((role) => (
                  <td key={role} className="border-b border-line text-center">
                    <span className="inline-flex justify-center">
                      <AccessSquare level={row.access[role]} label={`${f.roleLabel[role]}: ${m.access[row.access[role]]}`} />
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line px-5 py-3">
        <span className="inline-flex items-center gap-2 text-label text-ink-2">
          <AccessSquare level="full" />
          {m.access.full}
        </span>
        <span className="inline-flex items-center gap-2 text-label text-ink-2">
          <AccessSquare level="half" />
          {m.access.half}
        </span>
        <span className="inline-flex items-center gap-2 text-label text-ink-2">
          <AccessSquare level="none" />
          {m.access.none}
        </span>
      </div>
      <ul className="flex flex-col gap-1 border-t border-line px-5 py-3 text-label text-ink-2">
        <li>{m.notes.ownersManage}</li>
        <li>{m.notes.viewersCountOnly}</li>
        <li>{m.notes.everyMemberSignsIn}</li>
        <li>{m.notes.supportScope}</li>
      </ul>
    </Plate>
  );
}
