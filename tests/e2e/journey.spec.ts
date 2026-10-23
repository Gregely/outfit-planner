import { expect, test, type Locator, type Page } from "@playwright/test";

// Cache Components keeps recently visited pages mounted but hidden, so always target visible elements.
const visible = (l: Locator) => l.filter({ visible: true }).first();
const toast = (page: Page, text: RegExp | string) => visible(page.getByRole("status").filter({ hasText: text }));

test.describe.configure({ mode: "serial" });

test("from describing clothes to planning a week and logging what was worn", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. Onboarding
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Your wardrobe, considered/ })).toBeVisible();

  // 2. Natural-language import with review (offline parser, since Claude is disabled)
  await visible(page.getByRole("link", { name: /Describe my clothes/ })).click();
  await expect(page).toHaveURL(/\/wardrobe\/import/);
  await page.getByLabel("Your clothes").fill(
    [
      "A white oxford shirt and a black t-shirt.",
      "Navy chinos, raw denim jeans and grey wool trousers.",
      "Brown leather chelsea boots and white canvas sneakers.",
      "A charcoal wool overcoat and a dark brown, almost charcoal tweed blazer, relaxed fit, for dark academia outfits.",
    ].join("\n"),
  );
  await visible(page.getByRole("button", { name: /Find garments/ })).click();
  await expect(visible(page.getByText(/9 garments found/))).toBeVisible();
  await expect(visible(page.getByText("Offline parser"))).toBeVisible();
  // correct a field before saving
  const firstName = visible(page.getByLabel("Name"));
  await firstName.fill("Crisp white oxford shirt");
  await visible(page.getByRole("button", { name: /Save 9 garments/ })).click();
  await expect(visible(page.getByRole("heading", { name: "Saved" }))).toBeVisible();
  await visible(page.getByRole("button", { name: "Go to wardrobe" })).click();
  await expect(page).toHaveURL(/\/wardrobe$/);
  await expect(visible(page.getByRole("link", { name: "Crisp white oxford shirt" }))).toBeVisible();

  // 3. Manual entry
  await visible(page.getByRole("link", { name: /Add garment/ })).click();
  await visible(page.getByLabel("Name")).fill("Burgundy lambswool jumper");
  await visible(page.getByLabel("Category")).selectOption("knitwear");
  await visible(page.getByRole("button", { name: "Add garment" })).click();
  await expect(page).toHaveURL(/\/wardrobe\/\d+$/);
  await expect(visible(page.getByRole("heading", { name: "Burgundy lambswool jumper" }))).toBeVisible();
  // illustration is served as an SVG image
  const art = visible(page.getByRole("img", { name: "Burgundy lambswool jumper" }));
  const src = await art.getAttribute("src");
  const svg = await request.get(src!);
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");

  // 4. Mark the jumper unavailable: it must not appear in suggestions
  await visible(page.getByLabel("Status of Burgundy lambswool jumper")).selectOption("in_wash");
  await expect(toast(page, /in the wash/i)).toBeVisible();

  // 5. Ask the (rule-based) stylist
  await visible(page.getByRole("link", { name: "Outfits" })).click();
  await visible(page.getByRole("button", { name: "College" })).click();
  await visible(page.getByRole("button", { name: /Suggest outfits/ })).click();
  const cards = page.getByTestId("outfit-card").filter({ visible: true });
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(2);
  await expect(visible(cards.first().getByText("Rule-based"))).toBeVisible();
  for (const card of await cards.all()) await expect(card.getByRole("link", { name: "Burgundy lambswool jumper" })).toHaveCount(0);

  // 6. Save one, swap a single item, keep the rest
  const card = cards.first();
  const before = await card.getByRole("list", { name: "Garments" }).getByRole("link").allTextContents();
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page, /Saved to your outfits/)).toBeVisible();
  const shoeName = before.find((n) => /boots|sneakers/i.test(n))!;
  await card.getByRole("button", { name: `Swap ${shoeName}` }).click();
  const dialog = page.getByRole("dialog", { name: `Swap ${shoeName}` });
  await dialog.getByRole("button").filter({ hasText: /sneakers|boots/i }).first().click();
  await expect(toast(page, /Swapped/)).toBeVisible();
  const after = await card.getByRole("list", { name: "Garments" }).getByRole("link").allTextContents();
  expect(after).not.toContain(shoeName);
  expect(after.filter((n) => !/boots|sneakers/i.test(n)).sort()).toEqual(before.filter((n) => !/boots|sneakers/i.test(n)).sort());

  // 7. Mark it worn
  await card.getByRole("button", { name: /Wore it/ }).click();
  await page.getByRole("dialog", { name: "Mark as worn" }).getByRole("button", { name: "Log it" }).click();
  await expect(toast(page, /Logged for/)).toBeVisible();
  await page.goto("/outfits?view=history");
  await expect(visible(page.getByRole("button", { name: "Undo" }))).toBeVisible();

  // 8. Weekly plan, lock a day, regenerate another
  await page.goto("/planner");
  await visible(page.getByRole("button", { name: /Generate the week/ })).click();
  await expect(toast(page, /Planned \d+ day/)).toBeVisible();
  const days = page.locator("[data-testid^=day-]").filter({ visible: true });
  await expect(days).toHaveCount(7);
  const lockedDay = days.nth(2);
  const lockedNames = await lockedDay.getByRole("list", { name: "Garments" }).getByRole("link").allTextContents();
  await lockedDay.getByRole("button", { name: "Lock day" }).click();
  await expect(toast(page, /Locked/)).toBeVisible();
  await expect(lockedDay.getByRole("button", { name: "Regenerate" })).toBeDisabled();
  await days.nth(4).getByRole("button", { name: "Regenerate" }).click();
  await expect(toast(page, /other days unchanged/)).toBeVisible();
  await page.reload();
  const lockedAfter = await page.locator("[data-testid^=day-]").filter({ visible: true }).nth(2).getByRole("list", { name: "Garments" }).getByRole("link").allTextContents();
  expect(lockedAfter).toEqual(lockedNames);

  // 9. Data persists and can be exported
  const backup = await request.get("/api/export/backup?photos=0");
  expect(backup.ok()).toBe(true);
  const json = await backup.json();
  expect(json.app).toBe("wardrobe-studio");
  expect(json.data.garments).toHaveLength(10);
  expect(json.data.wearLogs).toHaveLength(1);

  expect(errors).toEqual([]);
});

test("the API refuses cross-site writes", async ({ request }) => {
  const res = await request.post("/api/sample", { headers: { origin: "https://evil.example" } });
  expect(res.status()).toBe(403);
});
