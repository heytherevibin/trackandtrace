// The site notice switch (Console Switches.dc.html, "Site notice"). Pure and import-free, so the
// plate mints its tap with the same function the route saves with: the changes a member approved
// are the changes that are written, by construction.

/** The Switches sheet: "Up to 160 characters." (The column allows 200.) */
export const NOTICE_MAX = 160;

export type NoticeChanges =
  | { readonly site_notice_on: true; readonly site_notice_text: string; readonly site_notice_version: number }
  | { readonly site_notice_on: false };

/**
 * What a save sends. Turning the notice on — or saving it on with new text — moves the version on,
 * which is what makes a device that closed the old notice see the new one. Turning it off touches
 * nothing else, so the text is still there to turn back on.
 */
export function noticeChanges({ on, text, current }: { readonly on: boolean; readonly text: string; readonly current: number | null }): NoticeChanges {
  if (!on) return { site_notice_on: false };
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.length > NOTICE_MAX) throw new Error(`a notice is 1 to ${NOTICE_MAX} characters`);
  return { site_notice_on: true, site_notice_text: trimmed, site_notice_version: (current ?? 0) + 1 };
}

export interface NoticeState {
  readonly on: boolean;
  readonly text: string;
  /** The version travellers' devices remember having closed. Null until a notice has been written. */
  readonly version: number | null;
}

/** The notice as the console holds it. A missing row or null columns read as off, with nothing written yet. */
export function readNotice(row: { readonly site_notice_on?: boolean | null; readonly site_notice_text?: string | null; readonly site_notice_version?: number | null } | null): NoticeState {
  return {
    on: row?.site_notice_on === true,
    text: row?.site_notice_text ?? "",
    version: typeof row?.site_notice_version === "number" ? row.site_notice_version : null,
  };
}
