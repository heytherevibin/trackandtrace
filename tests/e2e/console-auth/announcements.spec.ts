import { consoleMessages } from "@/console/messages";
import { consoleSql, expect, readOutbox, resetConsole, setUpFirstOwner, test } from "./fixtures";
import { expectAxeClean, gotoReady } from "../helpers";
import { layoutBreaks } from "../layout";

const BASE = "http://admin.localhost:4211";
const m = consoleMessages.announcements;

// Two confirmed news subscribers, seeded directly: the sign-up flow has its own spec
// (subscribe.spec.ts) and this one is about what the console does with the list.
const PEOPLE = ["e2e0a001-0000-4000-8000-000000000001", "e2e0a001-0000-4000-8000-000000000002"] as const;

function seed(): void {
  consoleSql(`
    delete from announcements.letters;
    delete from subscriptions.people where id in ('${PEOPLE[0]}', '${PEOPLE[1]}');
    insert into subscriptions.people (id, email, first_source) values
      ('${PEOPLE[0]}', 'e2e-letters-one@example.in', 'footer'),
      ('${PEOPLE[1]}', 'e2e-letters-two@example.in', 'footer');
    insert into subscriptions.consents (person_id, list, notice_version, source, confirmed_at) values
      ('${PEOPLE[0]}', 'news', '1.1', 'footer', now()),
      ('${PEOPLE[1]}', 'news', '1.1', 'footer', now());`);
}

test.beforeEach(() => {
  resetConsole();
  seed();
  // Suppressions are counted and named by their masked form below, so each test starts with none.
  consoleSql("delete from announcements.suppressions;");
});
test.afterAll(() => {
  // The local stack is shared: leave no letter and no seeded reader behind.
  consoleSql(`delete from announcements.letters; delete from announcements.suppressions; delete from subscriptions.people where id in ('${PEOPLE[0]}', '${PEOPLE[1]}');`);
});

/**
 * 07 Announcements, Letters. The arithmetic and every state are proven in tests/unit/console/
 * announcements and supabase/tests/console_letters.test.sql. This proves the whole path once, in a
 * real browser against the real database: write, save, test, queue, stop — and that each step that
 * the spec says is audited left its row.
 */
test.describe("Announcements", () => {
  test("an Owner writes a letter, tests it, queues it and stops it", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);
    const subject = `Trakline news: e2e ${Date.now() % 100000}`;
    // Counted, not assumed: other specs in this suite confirm readers of their own, and the composer
    // shows the whole list. At least the two seeded above.
    const people = consoleSql("select count(*) from subscriptions.consents where list = 'news' and confirmed_at is not null and withdrawn_at is null");
    expect(Number(people)).toBeGreaterThanOrEqual(2);

    await page.getByRole("navigation", { name: "Console" }).getByRole("link", { name: /Announcements/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: m.title })).toBeVisible();
    await expect(page.getByText(m.letters.none)).toBeVisible();
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    // Write and save. Queue is off, and says why.
    await page.getByRole("link", { name: m.newLetter }).click();
    await page.getByLabel(m.compose.subject).fill(subject);
    await page.getByLabel(m.compose.body).fill("Hello,\n\nOne thing is new.\n\nThe Trakline team");
    const queue = page.getByRole("button", { name: m.compose.queue });
    await expect(queue).toBeDisabled();
    await page.getByRole("button", { name: m.compose.save }).click();
    await expect(page.getByText(m.compose.saved, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/announcements\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("radio", { name: /News/ })).toContainText(`${people} people confirmed.`);
    await expect(queue).toBeDisabled();
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    // Test: one real email, to the Owner, reading as a subscriber's would.
    await page.getByRole("button", { name: m.compose.test.send }).click();
    await expect(page.getByText(m.compose.test.done, { exact: true })).toBeVisible();
    const letters = await readOutbox(page, owner.email);
    const proof = letters.find((l) => l.subject === subject);
    expect(proof, "the test went to the member's own address").toBeDefined();
    expect(proof?.text).toContain("One thing is new.");
    expect(proof?.text.trimEnd()).toMatch(/\/unsubscribe$/);

    // Queue: the dialog names how many people, and the letter becomes Queued.
    await expect(queue).toBeEnabled();
    await queue.click();
    const asking = page.getByRole("alertdialog", { name: m.queueDialog.title });
    await expect(asking.getByText(subject)).toBeVisible();
    await expect(asking.getByText(people, { exact: true })).toBeVisible();
    await asking.getByRole("button", { name: m.queueDialog.confirm }).click();
    await expect(page.getByText(m.compose.queued, { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: m.detail.progress })).toContainText(`0 of ${people} handled`);
    expect(consoleSql(`select state || ':' || recipients_total from announcements.letters where subject = '${subject}'`)).toBe(`queued:${people}`);
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    // Stop: asked first, then final.
    await page.getByRole("button", { name: m.detail.stop, exact: true }).click();
    const stopping = page.getByRole("alertdialog", { name: m.stopDialog.title });
    await expect(stopping.getByText(subject)).toBeVisible();
    await stopping.getByRole("button", { name: m.stopDialog.confirm }).click();
    await expect(page.getByText(m.stopDialog.done, { exact: true })).toBeVisible();
    // Exact: the Stop strip and the dialog both contain this sentence inside a longer one.
    await expect(page.getByText(m.detail.cantResume, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: m.detail.stop, exact: true })).toHaveCount(0);

    // The list shows it stopped, and the audit log holds the three acts.
    await page.getByRole("link", { name: m.allLetters }).click();
    await expect(page.getByRole("table", { name: m.letters.caption }).getByRole("row", { name: new RegExp(subject) })).toContainText(m.states.stopped);
    expect(
      consoleSql(`select string_agg(action, ', ' order by at) from console.audit_log where category = 'messages' and target = '${subject}' and result = 'done'`),
    ).toBe("Sent a test letter, Queued a letter, Stopped a letter");
  });

  test("a draft is deleted from its row, after a confirm, and nothing that was queued can be", async ({ page, baseURL }) => {
    await setUpFirstOwner(page, baseURL ?? BASE);
    const draft = "e2e0c003-0000-4000-8000-000000000001";
    const queued = "e2e0c003-0000-4000-8000-000000000002";
    consoleSql(`
      insert into announcements.letters (id, list, subject, body, created_by) values ('${draft}', 'news', 'A draft to delete', 'Hello', gen_random_uuid());
      insert into announcements.letters (id, list, subject, body, state, created_by, queued_at, recipients_total, test_sent_at, test_sent_to)
        values ('${queued}', 'news', 'A queued letter', 'Hello', 'queued', gen_random_uuid(), now(), 1, now(), 'proof@example.in');`);

    await gotoReady(page, "/announcements");
    const table = page.getByRole("table", { name: m.letters.caption });
    await expect(table.getByRole("row", { name: /A queued letter/ }).getByRole("button")).toHaveCount(0);
    await table.getByRole("button", { name: m.letters.deleteLabel("A draft to delete") }).click();

    const asking = page.getByRole("alertdialog", { name: m.deleteDialog.title });
    await expect(asking.getByText("A draft to delete")).toBeVisible();
    await expectAxeClean(page, { allowDesignLockedAccent: true });
    expect(consoleSql(`select count(*) from announcements.letters where id = '${draft}'`), "asking deletes nothing").toBe("1");

    await asking.getByRole("button", { name: m.deleteDialog.confirm }).click();
    await expect(page.getByText(m.deleteDialog.done, { exact: true })).toBeVisible();
    await expect(table.getByRole("row", { name: /A draft to delete/ })).toHaveCount(0);
    await expect(table.getByRole("row", { name: /A queued letter/ })).toBeVisible();
    expect(consoleSql(`select count(*) from announcements.letters where id = '${draft}'`)).toBe("0");
    expect(consoleSql(`select count(*) from console.audit_log where category = 'messages' and action = 'Deleted a draft' and target = 'A draft to delete' and result = 'done'`)).toBe("1");
  });

  test("on a phone the list is cards, a draft is read-only, and Stop is a sheet", async ({ page, baseURL }) => {
    await setUpFirstOwner(page, baseURL ?? BASE);
    const draft = "e2e0b002-0000-4000-8000-000000000001";
    const open = "e2e0b002-0000-4000-8000-000000000002";
    consoleSql(`
      insert into announcements.letters (id, list, subject, body, created_by) values ('${draft}', 'news', 'A phone draft', 'Hello', gen_random_uuid());
      insert into announcements.letters (id, list, subject, body, state, created_by, queued_at, recipients_total, test_sent_at, test_sent_to)
        values ('${open}', 'news', 'A phone letter', 'Hello', 'queued', gen_random_uuid(), now(), 2, now(), 'proof@example.in');
      insert into announcements.deliveries (letter_id, person_id) values ('${open}', '${PEOPLE[0]}'), ('${open}', '${PEOPLE[1]}');`);
    await page.setViewportSize({ width: 390, height: 844 });

    await gotoReady(page, "/announcements");
    await expect(page.getByRole("link", { name: m.letters.open("A phone letter") })).toBeVisible();
    await expect(page.getByRole("table")).toBeHidden();
    expect(await layoutBreaks(page)).toEqual([]);
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    await gotoReady(page, `/announcements/${draft}`);
    await expect(page.getByText(m.phone.note)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    expect(await layoutBreaks(page)).toEqual([]);

    await gotoReady(page, `/announcements/${open}`);
    await page.getByRole("button", { name: m.detail.stop, exact: true }).click();
    const sheet = page.getByRole("alertdialog", { name: m.stopDialog.title });
    await expect(sheet).toBeVisible();
    // Polled: the sheet arrives through a short scale-and-fade, and a box read mid-way is not its place.
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox();
        return box ? [Math.round(box.x), Math.round(box.y + box.height), Math.round(box.width)] : null;
      }, { message: "the sheet sits on the bottom edge and spans the screen" })
      .toEqual([0, 844, 390]);
    await sheet.getByRole("button", { name: m.stopDialog.confirm }).click();
    // Exact: the Stop strip and the dialog both contain this sentence inside a longer one.
    await expect(page.getByText(m.detail.cantResume, { exact: true })).toBeVisible();
    expect(await layoutBreaks(page)).toEqual([]);
  });

  test("Suppressions: an operator's address is named, a reader's is masked until revealed, and only then can it be lifted", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);
    const reader = `e2e-supp-${Date.now() % 100000}@example.in`;
    const actor = `(select user_id from console.members where email = '${owner.email}')`;
    const audited = (action: string) => consoleSql(`select count(*) from console.audit_log where category = 'messages' and action = '${action}' and target = 'e•••@example.in' and actor_id = ${actor}`);
    consoleSql(`
      insert into announcements.suppressions (email, scope, reason, source, at) values
        ('${owner.email}', 'all', 'hard bounce', 'resend', now()),
        ('${reader}', 'all', 'hard bounce', 'resend', now() - interval '1 day');`);

    await gotoReady(page, "/announcements");
    await page.getByRole("navigation", { name: m.tabs.label }).getByRole("link", { name: m.tabs.suppressions }).click();
    await expect(page).toHaveURL(/\/announcements\/suppressions$/);

    // An operator whose mail is stopped entirely is said above the table, by address.
    await expect(page.getByRole("status").filter({ hasText: m.suppressions.bannerOne })).toContainText(owner.email);

    const table = page.getByRole("table", { name: m.suppressions.caption });
    const masked = table.getByRole("row", { name: /e•••@example\.in/ });
    await expect(masked.getByRole("button", { name: m.suppressions.liftLabelMasked("e•••@example.in") })).toBeDisabled();
    await expect(page.getByText(reader)).toHaveCount(0);
    expect(await page.content(), "a masked address is nowhere in the page, not only off the screen").not.toContain(reader);
    await expectAxeClean(page, { allowDesignLockedAccent: true });

    // Reveal: the address, and a row in the audit log saying who asked.
    await masked.getByRole("button", { name: m.suppressions.revealLabel("e•••@example.in") }).click();
    const revealed = table.getByRole("row", { name: new RegExp(reader.replace(/[.]/g, "\\.")) });
    await expect(revealed).toBeVisible();
    expect(audited("Revealed a suppressed address")).toBe("1");

    // Lift: asked first, then gone, and recorded.
    await revealed.getByRole("button", { name: m.suppressions.liftLabel(reader) }).click();
    const asking = page.getByRole("alertdialog", { name: m.suppressions.liftDialog.title });
    await expect(asking.getByText(reader)).toBeVisible();
    await asking.getByRole("button", { name: m.suppressions.liftDialog.confirm }).click();
    await expect(page.getByText(m.suppressions.liftDialog.done, { exact: true })).toBeVisible();
    await expect(table.getByRole("row", { name: new RegExp(reader.replace(/[.]/g, "\\.")) })).toHaveCount(0);
    expect(consoleSql(`select count(*) from announcements.suppressions where email = '${reader}'`)).toBe("0");
    expect(audited("Lifted a suppression")).toBe("1");

    // On a phone: cards, Reveal, and no Lift.
    consoleSql(`insert into announcements.suppressions (email, scope, reason, source) values ('${reader}', 'list', 'complaint', 'resend');`);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(page, "/announcements/suppressions");
    const cards = page.getByRole("list", { name: m.suppressions.caption });
    await expect(cards.getByRole("button", { name: m.suppressions.revealLabel("e•••@example.in") })).toBeVisible();
    await expect(page.getByRole("button", { name: /Lift/ })).toHaveCount(0);
    await expect(page.getByText(m.suppressions.phoneNotes[0])).toBeVisible();
    expect(await layoutBreaks(page)).toEqual([]);
    await expectAxeClean(page, { allowDesignLockedAccent: true });
  });
});
