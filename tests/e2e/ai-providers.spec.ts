import { expect, test, type Locator, type Page } from "@playwright/test";

// Cache Components keeps recently visited pages mounted but hidden, so always target visible elements.
const visible = (l: Locator) => l.filter({ visible: true }).first();
const MOCK = "http://127.0.0.1:3299/v1";

test.describe.configure({ mode: "serial" });

async function card(page: Page, name: string) {
  const c = visible(page.locator("details", { has: page.locator("summary", { hasText: name }) }));
  if (!(await c.getAttribute("open"))) await c.locator("summary").click();
  return c;
}

test.afterAll(async ({ request }) => {
  // leave the shared test server as the other specs expect it: no AI provider, empty wardrobe
  const view = await (await request.get("/api/ai")).json();
  for (const p of view.providers) if (p.id.startsWith("custom-")) await request.delete(`/api/ai/providers/${p.id}`);
  await request.post("/api/import/backup", { data: { app: "wardrobe-studio", version: 1, exportedAt: new Date().toISOString(), data: { garments: [] } } });
});

test("add an OpenAI-compatible endpoint, test it for real, pick its model and get attributed suggestions", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await request.post("/api/sample");

  await page.goto("/settings");
  await expect(visible(page.getByRole("heading", { name: "AI providers" }))).toBeVisible();
  // nothing configured: the built-in stylist handles everything
  await expect(visible(page.getByText(/No AI provider is set up yet/))).toBeVisible();

  await visible(page.getByRole("button", { name: /Add an OpenAI-compatible endpoint/ })).click();
  await visible(page.getByLabel("Name")).fill("Mock server");
  await visible(page.getByLabel("Base URL")).fill(MOCK);
  await visible(page.getByRole("button", { name: "Add endpoint" })).click();

  const mock = await card(page, "Mock server");
  await expect(mock.getByText("Not tested yet")).toBeVisible();

  // a wrong model ID fails the test – no false "connected"
  await mock.getByRole("textbox", { name: "Model ID" }).fill("no-such-model");
  await mock.getByRole("button", { name: "Test connection" }).click();
  await expect(mock.getByRole("status")).toContainText(/that model isn't available from Mock server/);

  // live model list, then a passing test
  await mock.getByRole("button", { name: /Models/ }).click();
  await expect(visible(page.getByText("1 model found."))).toBeVisible();
  await expect(mock.getByRole("option", { name: "mock-stylist" })).toBeAttached();
  await mock.getByRole("combobox", { name: "Model", exact: true }).selectOption("mock-stylist");
  await mock.getByRole("button", { name: "Test connection" }).click();
  await expect(mock.getByRole("status")).toContainText("Connected – mock-stylist returned a valid structured answer.");
  await mock.getByRole("button", { name: /Use mock-stylist/ }).click();
  await expect(visible(page.getByText("Now using Mock server · mock-stylist"))).toBeVisible();
  await expect(mock.getByText("Working · mock-stylist")).toBeVisible();

  // the key field is write-only and the page never contains a key
  const html = await page.content();
  expect(html).not.toMatch(/sk-[A-Za-z0-9]{8,}/);

  // suggestions now come from the mock model, checked by the app and labelled with it
  await page.goto("/outfits");
  await expect(visible(page.getByText(/Ask Mock server/))).toBeVisible();
  await visible(page.getByRole("button", { name: /Suggest outfits/ })).click();
  await expect(visible(page.getByText("Mock server · mock-stylist"))).toBeVisible();

  // switching back to the built-in stylist keeps everything else
  await page.goto("/settings");
  await visible(page.getByLabel("Use AI for suggestions, imports and planning")).uncheck();
  await expect(visible(page.getByText(/AI switched off/))).toBeVisible();
  await page.goto("/wardrobe");
  await expect(visible(page.getByText("32 items"))).toBeVisible();
  await visible(page.getByRole("link", { name: "Settings" })).click();
  await visible(page.getByLabel("Use AI for suggestions, imports and planning")).check();
  expect(errors).toEqual([]);
});
