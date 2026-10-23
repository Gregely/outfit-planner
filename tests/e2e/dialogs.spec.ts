import { expect, test, type Page } from "@playwright/test";

/**
 * Regression: dialogs opened from planner days used to close themselves straight away
 * (React Strict Mode / <Activity> effect cycles were read as "dismiss"). Every dialog must
 * stay open, keep what's typed, and close only when the user dismisses or completes it.
 */

const SETTLE = 1200; // longer than the old open-then-vanish window

async function seedWeek(page: Page) {
  const base = test.info().project.use.baseURL!;
  const headers = { origin: base };
  const garments = await page.request.get(`${base}/api/garments`);
  if ((await garments.json()).garments.length === 0) await page.request.post(`${base}/api/sample`, { headers });
  const today = (await (await page.request.get(`${base}/api/weather`)).json()) as { days: Record<string, unknown> };
  const start = Object.keys(today.days)[0];
  const res = await page.request.post(`${base}/api/planner/week`, { headers, data: { start, useAi: false } });
  expect(res.ok()).toBe(true);
}

const openDialogs = (page: Page) => page.locator("dialog[open]");

// Leave the app empty for other specs, using the real restore endpoint with an empty backup.
test.afterAll(async ({ request }) => {
  const base = test.info().project.use.baseURL!;
  const res = await request.post(`${base}/api/import/backup`, {
    headers: { origin: base },
    data: { app: "wardrobe-studio", version: 1, exportedAt: new Date().toISOString(), data: { garments: [] } },
  });
  expect(res.ok()).toBe(true);
});

test.beforeEach(async ({ page }) => {
  await seedWeek(page);
  await page.goto("/planner");
  await expect(page.locator("[data-testid^=day-]").filter({ visible: true }).first()).toBeVisible();
});

test("planner dialogs stay open, keep their input and close only when dismissed", async ({ page }) => {
  const day = page.locator("[data-testid^=day-]").filter({ visible: true }).first();

  // Swap one item
  await day.getByRole("button", { name: /^Swap / }).first().click();
  await page.waitForTimeout(SETTLE);
  const swap = page.getByRole("dialog", { name: /^Swap / });
  await expect(swap).toBeVisible();
  await expect(swap.getByText(/Finding alternatives|Or choose it yourself|No suitable/).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(openDialogs(page)).toHaveCount(0);

  // Mark as worn: typed notes survive
  await day.getByRole("button", { name: /Wore it/ }).click();
  await page.waitForTimeout(SETTLE);
  const wear = page.getByRole("dialog", { name: "Mark as worn" });
  await expect(wear).toBeVisible();
  await wear.getByLabel("Notes (optional)").fill("felt great");
  await page.waitForTimeout(SETTLE);
  await expect(wear.getByLabel("Notes (optional)")).toHaveValue("felt great");
  await wear.getByRole("button", { name: "Cancel" }).click();
  await expect(openDialogs(page)).toHaveCount(0);

  // Rename via the actions menu, then backdrop click dismisses
  await day.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Rename / tag" }).click();
  await page.waitForTimeout(SETTLE);
  const rename = page.getByRole("dialog", { name: "Rename and tag" });
  await expect(rename).toBeVisible();
  await rename.getByLabel("Name").fill("Planner look");
  await page.waitForTimeout(SETTLE);
  await expect(rename.getByLabel("Name")).toHaveValue("Planner look");
  // a drag that starts inside the dialog and ends on the backdrop must not dismiss
  const box = (await rename.getByLabel("Name").boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await expect(rename).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(openDialogs(page)).toHaveCount(0);

  // Adjust, weather and activity dialogs
  for (const [open, name] of [
    [() => day.getByRole("button", { name: /Adjust/ }).click(), "Adjust this outfit"],
    [() => day.getByTitle("Set the weather by hand").click(), /^Weather for /],
    [() => day.getByRole("button", { name: "Add", exact: true }).click(), "Add an activity"],
    [() => day.getByRole("button", { name: /Describe my day/ }).click(), "Describe your day"],
  ] as const) {
    await open();
    await page.waitForTimeout(SETTLE);
    await expect(page.getByRole("dialog", { name })).toBeVisible();
    await page.getByRole("dialog", { name }).getByRole("button", { name: "Close" }).click();
    await expect(openDialogs(page)).toHaveCount(0);
  }
});

test("completing a dialog closes it and applies the change", async ({ page }) => {
  const day = page.locator("[data-testid^=day-]").filter({ visible: true }).first();
  await day.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add an activity" });
  await dialog.getByLabel("What").fill("Team lunch");
  await page.waitForTimeout(SETTLE);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(openDialogs(page)).toHaveCount(0);
  await expect(day.getByText("Team lunch")).toBeVisible();
});
