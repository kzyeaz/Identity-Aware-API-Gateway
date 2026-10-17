import { test, expect } from "@playwright/test";

test("present a request, a forbidden write, and a traffic burst", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Gateway overview" })).toBeVisible();
  await page.getByRole("button", { name: "API playground", exact: false }).first().click();
  await page.getByRole("button", { name: "Send request", exact: false }).click();
  await expect(page.locator(".response-meta .status-code")).toHaveText("200");
  await page.getByLabel("Client identity").selectOption("reader");
  await page.getByLabel("Endpoint").selectOption("POST");
  await page.getByRole("button", { name: "Send request", exact: false }).click();
  await expect(page.locator(".response-meta .status-code")).toHaveText("403");
  await page.getByLabel("Client identity").selectOption("writer");
  await page.getByRole("button", { name: "Send request", exact: false }).click();
  await expect(page.locator(".response-meta .status-code")).toHaveText("201");
  await page.getByRole("button", { name: "Generate traffic", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("24 requests sent");
  await page.getByRole("button", { name: "Audit trail", exact: true }).click();
  await expect(page.getByRole("cell", { name: "429", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Project mutations", exact: false }).click();
  await expect(page.getByRole("cell", { name: "project.created", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Architecture", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Designed around identity" })).toBeVisible();
  await page.getByRole("button", { name: "Developer SDK", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make your first request" })).toBeVisible();
});

test("mobile navigation and page width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "API playground", exact: false }).first().click();
  await expect(page.getByRole("heading", { name: "Request builder" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
