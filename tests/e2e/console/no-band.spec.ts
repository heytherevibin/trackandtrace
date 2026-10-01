import { expect, test } from "../fixtures";

// The traveller site's "Updates by email" band and its footer belong to the traveller shell: the console has neither,
// on its sign-in page or on a page that needs a member (which, with no database here, draws the console's own error).
for (const path of ["/login", "/", "/keys"]) {
  test(`the console's ${path} has no Updates by email band and no sign-up form`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("#updates")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Updates by email" })).toHaveCount(0);
    await expect(page.getByText("Updates by email")).toHaveCount(0);
    await expect(page.locator("input[name='email'][autocomplete='email'] ~ button, form[aria-label='Updates by email']")).toHaveCount(0);
  });
}
