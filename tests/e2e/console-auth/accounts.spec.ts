import { consoleMessages } from "@/console/messages";
import { inviteAndSignIn } from "./audit-helpers";
import { consoleSql, expect, resetConsole, setUpFirstOwner, test } from "./fixtures";
import { freshAddress, tapThrough } from "./team-helpers";
import { expectAxeClean, gotoReady } from "../helpers";
import { layoutBreaks, sidewaysScroll } from "../layout";

const BASE = "http://admin.localhost:4211";
const m = consoleMessages.accounts;
const leads = consoleMessages.leads;
const frame = consoleMessages.frame;

// Two traveller accounts, seeded directly: signing in as a traveller has its own specs and this one
// is about what the console shows of the accounts that produced. A domain of their own, and two
// first letters, so each masked form names one row whatever else the shared local stack is holding.
// The active one has saved two PNRs, signed up for News and is signed in on one device.
const ACTIVE = { id: "e2e0a008-0000-4000-8000-000000000001", email: "zact@accounts-e2e.example", masked: "z•••@accounts-e2e.example" } as const;
const DISABLED = { id: "e2e0a008-0000-4000-8000-000000000002", email: "ydis@accounts-e2e.example", masked: "y•••@accounts-e2e.example" } as const;
const PERSON = "e2e0a008-0000-4000-8000-0000000000aa";
const PNRS = ["4141414141", "4242424242"] as const;
const NOBODY = "nobody@accounts-e2e.example";

const named = (text: string) => new RegExp(text.replace(/[.•]/g, "\\$&"));

const CLEAR = `
  delete from auth.users where email like '%@accounts-e2e.example';
  delete from subscriptions.people where email like '%@accounts-e2e.example';`;

function seed(): void {
  consoleSql(`${CLEAR}
    insert into auth.users (id, email, created_at, last_sign_in_at, banned_until) values
      ('${ACTIVE.id}', '${ACTIVE.email}', now() - interval '10 days', now() - interval '1 hour', null),
      ('${DISABLED.id}', '${DISABLED.email}', now() - interval '30 days', now() - interval '9 days', now() + interval '10 years');
    insert into auth.identities (id, user_id, provider, provider_id, identity_data) values
      (gen_random_uuid(), '${ACTIVE.id}', 'email', '${ACTIVE.id}', '{}'::jsonb),
      (gen_random_uuid(), '${DISABLED.id}', 'google', 'g-e2e-disabled', '{}'::jsonb);
    insert into public.watchlist_entries (user_id, pnr, label) values
      ('${ACTIVE.id}', '${PNRS[0]}', 'E2E one'),
      ('${ACTIVE.id}', '${PNRS[1]}', 'E2E two');
    insert into auth.sessions (id, user_id, created_at, updated_at) values
      (gen_random_uuid(), '${ACTIVE.id}', now() - interval '1 hour', now() - interval '1 hour');
    insert into subscriptions.people (id, email, first_source) values ('${PERSON}', '${ACTIVE.email}', 'footer');
    insert into subscriptions.consents (person_id, list, notice_version, source, confirmed_at) values ('${PERSON}', 'news', '1.1', 'footer', now());`);
}

test.beforeEach(() => {
  resetConsole();
  seed();
});
test.afterAll(() => {
  // The local stack is shared: leave no seeded account or sign-up behind.
  consoleSql(CLEAR);
});

/**
 * 08 Accounts. The list's arithmetic and every state are proven in tests/unit/console/accounts and
 * supabase/tests/console_accounts.test.sql. This proves the path once, in a real browser against
 * the real database: that a whole address and a saved PNR are nowhere in the page, that a search
 * never puts an address in the page's own, and that every recorded act left its row. That an
 * ended session is refused on its very next request is proven where it is enforced, in
 * supabase/tests/console_account_acts.test.sql.
 */
test.describe("Accounts", () => {
  test("an Owner filters, finds one account by its whole address, reveals it and reads its record; Support has no Accounts", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);
    const actor = `(select user_id from console.members where email = '${owner.email}')`;
    const audited = (action: string, target: string) => consoleSql(`select count(*) from console.audit_log where category = 'accounts' and action = '${action.replace(/'/g, "''")}' and target = '${target}' and actor_id = ${actor}`);

    await page.getByRole("navigation", { name: "Console" }).getByRole("link", { name: /Accounts/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: m.title })).toBeVisible();

    // Masked, and not only on the screen. A saved PNR is a count and nothing more.
    const table = page.getByRole("table", { name: m.table.caption });
    const active = table.getByRole("row", { name: named(ACTIVE.masked) });
    await expect(active).toContainText(m.table.emailLink);
    await expect(active.getByRole("cell", { name: "2", exact: true })).toBeVisible();
    await expect(active).toContainText(leads.news.subscribed);
    await expect(active).toContainText(m.status.active);
    const disabled = table.getByRole("row", { name: named(DISABLED.masked) });
    await expect(disabled).toContainText(m.table.google);
    await expect(disabled).toContainText(m.status.disabled);
    await expect(disabled).toContainText(leads.news.none);
    const source = await page.content();
    expect(source, "a masked address is nowhere in the page").not.toContain(ACTIVE.email);
    expect(source).not.toContain(DISABLED.email);
    for (const pnr of PNRS) expect(source, "a saved PNR is nowhere in the page").not.toContain(pnr);
    expect(await layoutBreaks(page)).toEqual([]);
    expect(await sidewaysScroll(page)).toBe(0);
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    // A filter goes to the address, and narrows the list.
    const bar = page.getByRole("search", { name: m.filters.label });
    await bar.getByRole("combobox", { name: m.filters.status, exact: true }).selectOption("disabled");
    await expect(page).toHaveURL(/\/accounts\?status=disabled$/);
    await expect(table.getByRole("row", { name: named(DISABLED.masked) })).toBeVisible();
    await expect(table.getByRole("row", { name: named(ACTIVE.masked) })).toHaveCount(0);
    await bar.getByRole("combobox", { name: m.filters.status, exact: true }).selectOption("");
    await expect(page).toHaveURL(/\/accounts$/);
    await bar.getByRole("combobox", { name: m.filters.method, exact: true }).selectOption("google");
    await expect(page).toHaveURL(/\/accounts\?method=google$/);
    await expect(table.getByRole("row", { name: named(ACTIVE.masked) })).toHaveCount(0);
    await bar.getByRole("combobox", { name: m.filters.method, exact: true }).selectOption("");
    await expect(page).toHaveURL(/\/accounts$/);

    // Part of an address is refused before any lookup is made, or recorded.
    const box = bar.getByRole("searchbox", { name: m.filters.search });
    await box.fill("zact");
    await box.press("Enter");
    await expect(bar.getByRole("alert")).toHaveText(m.errors.notAddress);
    expect(consoleSql(`select count(*) from console.audit_log where category = 'accounts' and action = 'Looked up an account by email' and actor_id = ${actor}`)).toBe("0");

    // The whole address finds one account, still masked; the address is not in the page's own.
    await box.fill(ACTIVE.email);
    await box.press("Enter");
    await expect(page.getByText(m.filters.exact)).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(table.getByRole("row", { name: named(ACTIVE.masked) })).toBeVisible();
    expect(page.url()).not.toContain("zact");
    expect(audited("Looked up an account by email", ACTIVE.masked)).toBe("1");

    // Nobody has this one, and that lookup is recorded too.
    await box.fill(NOBODY);
    await box.press("Enter");
    await expect(page.getByText(m.states.noMatchTitle)).toBeVisible();
    expect(consoleSql(`select after ->> 'found' from console.audit_log where category = 'accounts' and target = 'n•••@accounts-e2e.example' and actor_id = ${actor}`)).toBe("false");
    await page.getByRole("button", { name: m.filters.clear }).click();
    await expect(table.getByRole("row", { name: named(DISABLED.masked) })).toBeVisible();

    // Reveal: the address, and a row in the audit log saying who asked.
    await table.getByRole("row", { name: named(ACTIVE.masked) }).getByRole("button", { name: m.table.revealLabel(ACTIVE.masked) }).click();
    const revealed = table.getByRole("row", { name: named(ACTIVE.email) });
    await expect(revealed).toBeVisible();
    await expect(revealed.getByRole("button")).toHaveCount(0);
    expect(audited("Revealed an account's address", ACTIVE.masked)).toBe("1");

    // The record: its id in the address, the facts, one session, and the address already revealed.
    await revealed.getByRole("link", { name: m.table.open(ACTIVE.email) }).click();
    await expect(page).toHaveURL(new RegExp(`/accounts\\?account=${ACTIVE.id}$`));
    const record = page.getByRole("dialog", { name: m.record.title });
    await expect(record.getByText(ACTIVE.email)).toBeVisible();
    await expect(record.getByText(m.record.active)).toBeVisible();
    await expect(record.getByText(m.record.canSignIn)).toBeVisible();
    await expect(record.getByText(m.record.sessionCount(1))).toBeVisible();
    await expect(record.getByText(m.record.private)).toBeVisible();
    for (const pnr of PNRS) await expect(record.getByText(pnr)).toHaveCount(0);
    expect(await layoutBreaks(page)).toEqual([]);
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    // A disabled account's record says so, and that nobody is signed in.
    await record.getByRole("button", { name: "Close" }).click();
    await expect(page).toHaveURL(/\/accounts$/);
    await table.getByRole("row", { name: named(DISABLED.masked) }).getByRole("link", { name: m.table.open(DISABLED.masked) }).click();
    await expect(record.getByText(m.record.cannotSignIn)).toBeVisible();
    await expect(record.getByText(m.record.nobody)).toBeVisible();
    await record.getByRole("button", { name: "Close" }).click();

    // The News tag opens the same person in Leads.
    await table.getByRole("row", { name: named(ACTIVE.email) }).getByRole("link", { name: m.table.openLead(leads.news.subscribed, ACTIVE.email) }).click();
    await expect(page).toHaveURL(new RegExp(`/leads\\?lead=p(:|%3A)${PERSON}$`));
    await expect(page.getByRole("dialog", { name: leads.record.title }).getByText(ACTIVE.masked)).toBeVisible();

    // Support has Leads and not Accounts: no link in the rail, the page says so, and the routes refuse.
    const them = await inviteAndSignIn(page, freshAddress("kiran"), "Support", "Covering the leads queue this week.");
    try {
      await gotoReady(them, "/accounts");
      await expect(them.getByRole("heading", { level: 1, name: m.title })).toBeVisible();
      await expect(them.getByText(frame.states.noAccess.title(frame.roleLabel.support))).toBeVisible();
      await expect(them.getByRole("table")).toHaveCount(0);
      await expect(them.getByRole("navigation", { name: "Console" }).getByRole("link", { name: /Accounts/ })).toHaveCount(0);
      expect(await them.content()).not.toContain(ACTIVE.masked);
      const refused = await them.evaluate(async (id) => {
        const post = (path: string, body: unknown) => fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((response) => response.status);
        return [await post("/api/accounts/reveal", { id }), await post("/api/accounts/find", { email: "anyone@accounts-e2e.example" })];
      }, ACTIVE.id);
      expect(refused).toEqual([403, 403]);
      expect(consoleSql("select count(*) from console.audit_log where category = 'accounts' and actor_role = 'support'")).toBe("0");
    } finally {
      await them.context().close();
    }
  });

  test("an account is signed out everywhere, disabled and enabled again, each with a reason and a key, and each recorded", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);
    const actor = `(select user_id from console.members where email = '${owner.email}')`;
    const a = m.acts;
    const sessions = () => consoleSql(`select count(*) from auth.sessions where user_id = '${ACTIVE.id}'`);
    const banned = () => consoleSql(`select (banned_until is not null and banned_until > now())::text from auth.users where id = '${ACTIVE.id}'`);
    const logged = (action: string) => consoleSql(`select target || '|' || reason from console.audit_log where category = 'accounts' and action = '${action}' and actor_id = ${actor}`);
    const tc01 = page.getByRole("dialog", { name: "Confirm it's you" });

    await gotoReady(page, `/accounts?account=${ACTIVE.id}`);
    const record = page.getByRole("dialog", { name: m.record.title });
    await expect(record.getByText(m.record.sessionCount(1))).toBeVisible();

    // Sign out everywhere: asked first, then every session is gone, and they are not disabled.
    await record.getByRole("button", { name: a.signOut.action }).click();
    await expect(tc01.getByText(a.signOut.summary(ACTIVE.masked))).toBeVisible();
    await expect(tc01.getByText(a.signOut.hint(1))).toBeVisible();
    await expectAxeClean(page, { allowDesignLockedAccent: true });
    expect(sessions(), "asking ends nothing").toBe("1");
    await tapThrough(page, "Reported a lost phone and asked us to sign it out.");
    await expect(page.getByText(a.signOut.done, { exact: true })).toBeVisible();
    await expect(record.getByText(a.signOut.nobody)).toBeVisible();
    await expect(record.getByRole("button", { name: a.signOut.action })).toHaveCount(0);
    expect(sessions()).toBe("0");
    expect(banned()).toBe("false");
    expect(logged("Signed an account out everywhere")).toBe(`${ACTIVE.masked}|Reported a lost phone and asked us to sign it out.`);

    // Disable: the confirm says what is kept; afterwards the record says since when and by whom,
    // offers Enable, and the row behind it reads Disabled.
    await record.getByRole("button", { name: a.disable.action }).click();
    await expect(tc01.getByText(a.disable.summary(ACTIVE.masked))).toBeVisible();
    await expect(tc01.getByText(a.disable.hint)).toBeVisible();
    expect(banned(), "asking disables nothing").toBe("false");
    await tapThrough(page, "Automated checks from this account, against the terms.");
    await expect(page.getByText(a.disable.done, { exact: true })).toBeVisible();
    await expect(record.getByText(new RegExp(`^Can't sign in since .* IST\\. Disabled by ${owner.name}\\.$`))).toBeVisible();
    await expect(record.getByRole("button", { name: a.disable.action })).toHaveCount(0);
    // Found by its markup: the record is a modal, and what is behind a modal has no role to find it by.
    await expect(page.locator("tr", { hasText: ACTIVE.masked })).toContainText(m.status.disabled);
    expect(banned()).toBe("true");
    expect(consoleSql(`select count(*) from public.watchlist_entries where user_id = '${ACTIVE.id}'`), "saved PNRs are kept").toBe("2");
    expect(consoleSql(`select count(*) from subscriptions.consents where person_id = '${PERSON}' and withdrawn_at is null`), "and so is the subscription").toBe("1");
    expect(logged("Disabled an account")).toBe(`${ACTIVE.masked}|Automated checks from this account, against the terms.`);
    expect(await layoutBreaks(page)).toEqual([]);
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    // Enable: they can sign in again, and nothing else changed.
    await record.getByRole("button", { name: a.enable.action }).click();
    await expect(tc01.getByText(a.enable.summary(ACTIVE.masked))).toBeVisible();
    await tapThrough(page, "Wrote in and agreed to stop the automated checks.");
    await expect(page.getByText(a.enable.done, { exact: true })).toBeVisible();
    await expect(record.getByText(m.record.canSignIn)).toBeVisible();
    await expect(record.getByRole("button", { name: a.disable.action })).toBeVisible();
    expect(banned()).toBe("false");
    expect(logged("Enabled an account")).toBe(`${ACTIVE.masked}|Wrote in and agreed to stop the automated checks.`);
    expect(consoleSql("select count(*) from console.audit_log where category = 'accounts' and (coalesce(after::text, '') || target || coalesce(reason, '')) like '%@accounts-e2e%' and target not like '%•••%'"), "the log holds no whole address").toBe("0");
  });

  test("on a phone the list is cards with nothing to reveal, and the record is the whole screen", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);
    await page.setViewportSize({ width: 390, height: 844 });

    await gotoReady(page, "/accounts");
    const cards = page.getByRole("list", { name: m.table.caption });
    const card = cards.getByRole("link", { name: m.table.open(ACTIVE.masked) });
    await expect(card).toContainText(m.table.emailLink);
    await expect(card).toContainText(m.table.savedLine(2, leads.news.subscribed));
    await expect(cards.getByRole("link", { name: m.table.open(DISABLED.masked) })).toContainText(m.status.disabled);
    await expect(page.getByRole("table")).toBeHidden();
    await expect(cards.getByRole("button")).toHaveCount(0);
    expect(await layoutBreaks(page)).toEqual([]);
    expect(await sidewaysScroll(page)).toBe(0);
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    await card.click();
    const record = page.getByRole("dialog", { name: m.record.title });
    await expect(record.getByText(ACTIVE.masked)).toBeVisible();
    // Polled: the record slides in, and a box read on the way is not its place.
    await expect
      .poll(async () => {
        const box = await record.boundingBox();
        return box ? [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)] : null;
      }, { message: "the record covers the screen" })
      .toEqual([0, 0, 390, 844]);
    await expect(record.getByText(m.record.sessionCount(1))).toBeVisible();
    await expect(record.getByText(m.record.private)).toBeVisible();
    // Nothing is changed from a phone: no act is drawn, and the record says where to go instead.
    await expect(record.getByText(m.record.largerScreen)).toBeVisible();
    await expect(record.getByRole("button", { name: m.acts.signOut.action })).toHaveCount(0);
    await expect(record.getByRole("button", { name: m.acts.disable.action })).toHaveCount(0);

    await record.getByRole("button", { name: m.table.revealLabel(ACTIVE.masked) }).click();
    await expect(record.getByText(ACTIVE.email)).toBeVisible();
    await expect(record.getByText(m.record.revealed)).toBeVisible();
    expect(consoleSql(`select count(*) from console.audit_log where category = 'accounts' and action = 'Revealed an account''s address' and actor_id = (select user_id from console.members where email = '${owner.email}')`)).toBe("1");
    expect(await layoutBreaks(page)).toEqual([]);
    await expectAxeClean(page, { allowDesignLockedAccent: true });
  });
});
