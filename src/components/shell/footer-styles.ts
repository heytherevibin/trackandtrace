/** The footer's column grammar (v4): a Space Mono legend over a list of 14/20 links, 8px apart. */
export const COLUMN_HEAD = "legend m-0";
// A flex column, not a grid: a grid item keeps its min-content width, so at 200% text "Watchlist" ran past a phone's
// 112px column. Words wrap anywhere rather than run past the window.
export const COLUMN_LIST = "mt-3 flex list-none flex-col gap-2 p-0 text-sm leading-5 wrap-anywhere";
export const COLUMN_LINK = "";
