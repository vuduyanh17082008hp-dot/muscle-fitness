import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function captureScreenshots() {
  const screenshotsDir = path.join(process.cwd(), "public", "competition", "screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log("Launching Chromium browser for screenshot capture...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";

  console.log(`Connecting to ${baseUrl}...`);

  try {
    // 1. Dashboard
    console.log("Navigating to Dashboard...");
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotsDir, "dashboard.png") });
    console.log("Captured dashboard.png");

    // 2. Nutrition
    console.log("Navigating to Nutrition...");
    await page.goto(`${baseUrl}/dashboard/nutrition`, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotsDir, "nutrition.png") });
    console.log("Captured nutrition.png");

    // 3. Dante / Chat
    console.log("Navigating to Dante route...");
    await page.goto(`${baseUrl}/dashboard?section=dante`, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotsDir, "dante.png") });
    console.log("Captured dante.png");

    // 4. Progress / Recovery
    console.log("Navigating to Progress / Recovery...");
    await page.goto(`${baseUrl}/dashboard/split`, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotsDir, "progress.png") });
    console.log("Captured progress.png");

  } catch (err) {
    console.error("Screenshot capture error:", err);
  } finally {
    await browser.close();
    console.log("Screenshot capture process finished.");
  }
}

captureScreenshots();
