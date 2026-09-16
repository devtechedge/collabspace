import { expect, test } from "@playwright/test";

// The deploy runs without Supabase credentials, so the app boots into local
// demo mode. These specs pin that behaviour: a visitor gets a working canvas,
// not a configuration warning.
const LOCAL_BOARD_KEY = "collabspace:local-board:local-scratch";

test.describe("local demo shell", () => {
  test("renders a usable board instead of a config warning", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/CollabSpace/);
    await expect(page.getByTestId("app-shell")).toBeVisible();
    await expect(page.getByText("Supabase not configured")).toHaveCount(0);
    await expect(page.locator('[aria-label="Drawing tools"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Create new room" })).toBeVisible();
  });

  test("labels the board as local-only and dismisses", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByTestId("demo-mode-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Local demo mode");
    await expect(banner).toContainText("Supabase");

    await page.getByRole("button", { name: "Dismiss demo mode notice" }).click();
    await expect(banner).toHaveCount(0);
  });

  test("keeps a drawn stroke across a reload", async ({ page }) => {
    await page.goto("/");
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy + 80, { steps: 12 });
    await page.mouse.up();

    const stored = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as unknown[]).length : 0;
    }, LOCAL_BOARD_KEY);
    expect(stored).toBeGreaterThan(0);

    await page.reload();
    await expect(page.getByTestId("app-shell")).toBeVisible();
    const afterReload = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as unknown[]).length : 0;
    }, LOCAL_BOARD_KEY);
    expect(afterReload).toBe(stored);
  });

  test("marks chat as local-only", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Chat" }).click();
    await expect(page.getByTestId("chat-demo-note")).toBeVisible();
  });

  test("exposes a branded favicon", async ({ page }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="icon"]').getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toMatch(/favicon/);
    const res = await page.request.get("/favicon.svg");
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toContain("<svg");
  });
});
