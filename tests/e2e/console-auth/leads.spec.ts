import { consoleMessages } from "@/console/messages";
import { consoleSql, expect, resetConsole, setUpFirstOwner, test } from "./fixtures";
import { expectAxeClean, gotoReady } from "../helpers";
import { layoutBreaks } from "../layout";

const BASE = "http://admin.localhost:4211";
const m = consoleMessages.leads;

// Two sign-ups, seeded directly: the sign-up flow has its own spec (subscribe.spec.ts) and this one
// is about what the console shows of the people it produced. A domain of their own, and two first
// letters, so each masked form names one row whatever else the shared local stack is holding.
const SUBSCRIBED = { id: "e2e0d004-0000-4000-8000-000000000001", email: "zsub@leads-e2e.example", masked: "z•••@leads-e2e.example" } as const;
const PENDING = { id: "e2e0d004-0000-4000-8000-000000000002", email: "ypend@leads-e2e.example", masked: "y•••@leads-e2e.example" } as const;
const NOBODY = "nobody@leads-e2e.example";

const named = (text: string) => new RegExp(text.replace(/[.•]/g, "\\$&"));

function seed(): void {
  consoleSql(`
    delete from subscriptions.people where email like '%@leads-e2e.example';
    insert into subscriptions.people (id, email, first_source, campaign_source, campaign_medium, campaign_name, first_page) values
      ('${SUBSCRIBED.id}', '${SUBSCRIBED.email}', 'footer', 'google', 'cpc', 'diwali-2026', '/pre-booking'),
      ('${PENDING.id}', '${PENDING.email}', 'landing', null, null, null, null);
    insert into subscriptions.consents (person_id, list, notice_version, source, confirmed_at) values
      ('${SUBSCRIBED.id}', 'news', '1.1', 'footer', now()),
      ('${PENDING.id}', 'news', '1.1', 'landing', null);`);
}

test.beforeEach(() => {
  resetConsole();
  seed();
});
test.afterAll(() => {
  // The local stack is shared: leave no seeded sign-up behind.
  consoleSql("delete from subscriptions.people where email like '%@leads-e2e.example';");
});

/**
 * 06 Leads, first part. The list's arithmetic and every state are proven in tests/unit/console/leads
 * and supabase/tests/console_leads.test.sql. This proves the path once, in a real browser against
 * the real database: that a whole address is nowhere in the page until it is revealed, that a search
 * never puts one in the page's address, and that the two recorded acts left their rows.
 */
test.describe("Leads", () => {
  test("an Owner filters, finds one lead by its whole address, reveals it and reads its record", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);
    const actor = `(select user_id from console.members where email = '${owner.email}')`;
    const audited = (action: string, target: string) => consoleSql(`select count(*) from console.audit_log where category = 'leads' and action = '${action.replace(/'/g, "''")}' and target = '${target}' and actor_id = ${actor}`);

    await page.getByRole("navigation", { name: "Console" }).getByRole("link", { name: /Leads/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: m.title })).toBeVisible();
    await expect(page.getByRole("region", { name: m.figures.title })).toContainText(m.figures.note);

    // Masked, and not only on the screen.
    const table = page.getByRole("table", { name: m.table.caption });
    const subscribed = table.getByRole("row", { name: named(SUBSCRIBED.masked) });
    await expect(subscribed).toContainText(m.news.subscribed);
    await expect(subscribed).toContainText("google / cpc / diwali-2026");
    await expect(table.getByRole("row", { name: named(PENDING.masked) })).toContainText(m.news.pending);
    const source = await page.content();
    expect(source, "a masked address is nowhere in the page").not.toContain(SUBSCRIBED.email);
    expect(source).not.toContain(PENDING.email);
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    // A filter goes to the address, and narrows the list.
    const bar = page.getByRole("search", { name: m.filters.label });
    await bar.getByRole("combobox", { name: m.filters.news, exact: true }).selectOption("pending");
    await expect(page).toHaveURL(/\/leads\?news=pending$/);
    await expect(table.getByRole("row", { name: named(PENDING.masked) })).toBeVisible();
    await expect(table.getByRole("row", { name: named(SUBSCRIBED.masked) })).toHaveCount(0);
    await bar.getByRole("combobox", { name: m.filters.news, exact: true }).selectOption("");
    await expect(page).toHaveURL(/\/leads$/);

    // Part of an address is refused before any lookup is made, or recorded.
    const box = bar.getByRole("searchbox", { name: m.filters.search });
    await box.fill("zsub");
    await box.press("Enter");
    await expect(bar.getByRole("alert")).toHaveText(m.errors.notAddress);
    expect(consoleSql(`select count(*) from console.audit_log where category = 'leads' and action = 'Looked up a lead by email' and actor_id = ${actor}`)).toBe("0");

    // The whole address finds one lead, still masked; the address is not in the page's own.
    await box.fill(SUBSCRIBED.email);
    await box.press("Enter");
    await expect(page.getByText(m.filters.exact)).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(table.getByRole("row", { name: named(SUBSCRIBED.masked) })).toBeVisible();
    expect(page.url()).not.toContain("zsub");
    expect(audited("Looked up a lead by email", SUBSCRIBED.masked)).toBe("1");

    // Nobody has this one, and that lookup is recorded too.
    await box.fill(NOBODY);
    await box.press("Enter");
    await expect(page.getByText(m.states.noMatchTitle)).toBeVisible();
    expect(consoleSql(`select after ->> 'found' from console.audit_log where category = 'leads' and target = 'n•••@leads-e2e.example' and actor_id = ${actor}`)).toBe("false");
    await page.getByRole("button", { name: m.filters.clear }).click();
    await expect(table.getByRole("row", { name: named(PENDING.masked) })).toBeVisible();

    // Reveal: the address, and a row in the audit log saying who asked.
    await table.getByRole("row", { name: named(SUBSCRIBED.masked) }).getByRole("button", { name: m.table.revealLabel(SUBSCRIBED.masked) }).click();
    const revealed = table.getByRole("row", { name: named(SUBSCRIBED.email) });
    await expect(revealed).toBeVisible();
    await expect(revealed.getByRole("button")).toHaveCount(0);
    expect(audited("Revealed a lead's address", SUBSCRIBED.masked)).toBe("1");

    // The record: its id in the address, the consent in full, and the address already revealed.
    await revealed.getByRole("link", { name: m.table.open(SUBSCRIBED.email) }).click();
    await expect(page).toHaveURL(new RegExp(`/leads\\?lead=p(:|%3A)${SUBSCRIBED.id}$`));
    const record = page.getByRole("dialog", { name: m.record.title });
    await expect(record.getByText(SUBSCRIBED.email)).toBeVisible();
    await expect(record.getByText(/^Consented .* IST via the footer form · notice v1\.1 · confirmed .* IST$/)).toBeVisible();
    await expect(record.getByText(m.record.notOnList)).toBeVisible();
    await expect(record.getByText(m.record.noAccount)).toBeVisible();
    await expect(record.getByText("/pre-booking")).toBeVisible();
    await expect(record.getByText(m.record.retention)).toBeVisible();
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    await record.getByRole("button", { name: "Close" }).click();
    await expect(record).toHaveCount(0);
    await expect(page).toHaveURL(/\/leads$/);
    // Reading a record is not recorded; the two acts above are the only rows this visit wrote.
    expect(consoleSql(`select count(*) from console.audit_log where category = 'leads' and actor_id = ${actor}`)).toBe("3");
  });

  test("on a phone the list is cards with nothing to reveal, and the record is the whole screen", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);
    await page.setViewportSize({ width: 390, height: 844 });

    await gotoReady(page, "/leads");
    const cards = page.getByRole("list", { name: m.table.caption });
    await expect(cards.getByRole("link", { name: m.table.open(PENDING.masked) })).toBeVisible();
    await expect(page.getByRole("table")).toBeHidden();
    await expect(cards.getByRole("button")).toHaveCount(0);
    expect(await layoutBreaks(page)).toEqual([]);
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    await cards.getByRole("link", { name: m.table.open(SUBSCRIBED.masked) }).click();
    const record = page.getByRole("dialog", { name: m.record.title });
    await expect(record.getByText(SUBSCRIBED.masked)).toBeVisible();
    // Polled: the record slides in, and a box read on the way is not its place.
    await expect
      .poll(async () => {
        const box = await record.boundingBox();
        return box ? [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)] : null;
      }, { message: "the record covers the screen" })
      .toEqual([0, 0, 390, 844]);

    await record.getByRole("button", { name: m.table.revealLabel(SUBSCRIBED.masked) }).click();
    await expect(record.getByText(SUBSCRIBED.email)).toBeVisible();
    await expect(record.getByText(m.record.revealed)).toBeVisible();
    expect(consoleSql(`select count(*) from console.audit_log where category = 'leads' and action = 'Revealed a lead''s address' and actor_id = (select user_id from console.members where email = '${owner.email}')`)).toBe("1");
    expect(await layoutBreaks(page)).toEqual([]);
    await expectAxeClean(page, { allowDesignLockedAccent: true });
  });
});
