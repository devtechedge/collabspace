import { expect, test } from "@playwright/test";

test.describe("unconfigured production shell", () => {
  test("shows the Supabase not configured banner", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/CollabSpace/);
    const banner = page.getByTestId("supabase-unconfigured");
    await expect(banner).toBeVisible();
    await expect(page.getByTestId("site-title")).toContainText("Supabase not configured");
    await expect(banner).toContainText("VITE_SUPABASE_URL");
    await expect(banner).toContainText("VITE_SUPABASE_ANON_KEY");
  });

  test("does not render the full board chrome without env", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("app-shell")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /New Room/i })).toHaveCount(0);
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
