import { expect, test, type Page } from "@playwright/test";

/**
 * The Android app's web bundle in a phone-sized Chromium. There is no server at all here:
 * pages, API routes and SQLite all run in the page, and data is saved through the Capacitor
 * Filesystem web fallback (IndexedDB) – the same code path the APK uses with native storage.
 */

test.describe.configure({ mode: "serial" });

const MOCK = "http://127.0.0.1:3299/v1";

async function tab(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  const direct = nav.getByRole("link", { name, exact: true });
  if (await direct.count()) return direct.click();
  await nav.getByRole("button", { name: "More" }).click();
  await nav.getByRole("link", { name }).click();
}

test("works offline-first: wardrobe, persistence, planner, dialogs and backups", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Your wardrobe,/ })).toBeVisible();

  await page.getByRole("button", { name: "Load a sample wardrobe" }).click();
  await expect(page).toHaveURL(/\/wardrobe$/);
  await expect(page.getByText("32 items")).toBeVisible();
  // illustrations are drawn in the app, no server involved
  const src = await page.getByRole("img", { name: "Black Nike athletic shorts" }).getAttribute("src");
  expect(src).toMatch(/^data:image\/svg\+xml/);

  // add a garment through the form
  await page.getByRole("link", { name: /Add garment/ }).click();
  await page.getByLabel("Name").fill("Green rain jacket");
  await page.getByLabel("Category").selectOption("outerwear");
  await page.getByRole("button", { name: "Add garment" }).click();
  await expect(page.getByRole("heading", { name: "Green rain jacket" })).toBeVisible();

  // data survives a full restart of the app
  await page.reload();
  await expect(page.getByRole("heading", { name: "Green rain jacket" })).toBeVisible();
  await tab(page, "Wardrobe");
  await expect(page.getByText("33 items")).toBeVisible();

  // offline: everything local keeps working
  await page.context().setOffline(true);
  await expect(page.getByRole("status").filter({ hasText: "You're offline." })).toBeVisible();
  await tab(page, "Planner");
  await page.getByRole("button", { name: /Generate the week/ }).click();
  await expect(page.getByText(/Rule-based/).first()).toBeVisible();
  // dialogs open and stay open
  await page.getByRole("button", { name: /^Swap / }).first().click();
  const swap = page.getByRole("dialog", { name: /^Swap / });
  await page.waitForTimeout(800);
  await expect(swap).toBeVisible();
  await swap.getByRole("button", { name: "Close" }).click();
  await expect(swap).toHaveCount(0);
  await page.context().setOffline(false);
  await expect(page.getByRole("status").filter({ hasText: "You're offline." })).toHaveCount(0);

  // backup export downloads a file with the wardrobe and no device AI settings
  await tab(page, "Settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Full backup \(JSON\)/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^wardrobe-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8")));
  expect(backup.data.garments).toHaveLength(33);
  expect(backup.data.settings?.ai).toBeUndefined();

  // the browser back button walks the in-app history
  await page.goBack();
  await expect(page).toHaveURL(/\/planner/);
  expect(errors).toEqual([]);
});

test("AI provider set up on the device, used by the stylist, and skipped when offline", async ({ page }) => {
  // each test starts from a fresh install (new browser storage)
  await page.goto("/");
  await page.getByRole("button", { name: "Load a sample wardrobe" }).click();
  await expect(page).toHaveURL(/\/wardrobe$/);
  await tab(page, "Settings");
  await expect(page.getByRole("heading", { name: "AI providers" })).toBeVisible();
  // outside the APK the secure-storage plugin falls back to browser storage – and says so
  await expect(page.getByText(/Browser storage \(preview build – not secure\)/)).toBeVisible();

  await page.getByRole("button", { name: /Add an OpenAI-compatible endpoint/ }).click();
  await page.getByLabel("Name").fill("Phone mock");
  await page.getByLabel("Base URL").fill(MOCK);
  await page.getByRole("button", { name: "Add endpoint" }).click();
  const mock = page.locator("details", { has: page.locator("summary", { hasText: "Phone mock" }) });
  if (!(await mock.getAttribute("open"))) await mock.locator("summary").click();
  await mock.getByRole("button", { name: /Models/ }).click();
  await expect(mock.getByRole("option", { name: "mock-stylist" })).toBeAttached();
  await mock.getByRole("combobox", { name: "Model", exact: true }).selectOption("mock-stylist");
  await mock.getByRole("button", { name: "Test connection" }).click();
  await expect(mock.getByRole("status")).toContainText("Connected – mock-stylist returned a valid structured answer.");
  await mock.getByRole("button", { name: /Use mock-stylist/ }).click();
  await expect(mock.getByText("Working · mock-stylist")).toBeVisible();

  await tab(page, "Outfits");
  await page.getByRole("button", { name: /Suggest outfits/ }).click();
  await expect(page.getByText("Phone mock · mock-stylist").first()).toBeVisible();

  // the choice persists across restarts
  await page.reload();
  await tab(page, "Settings");
  await expect(page.locator("details", { has: page.locator("summary", { hasText: "Phone mock" }) }).getByText("Main")).toBeVisible();

  // offline: AI is skipped with a clear reason and the built-in stylist answers
  await page.context().setOffline(true);
  await tab(page, "Outfits");
  await expect(page.getByText(/you're offline/i).first()).toBeVisible();
  await page.getByRole("button", { name: /Suggest outfits/ }).click();
  await expect(page.getByText("Rule-based").first()).toBeVisible();
  await page.context().setOffline(false);
});
