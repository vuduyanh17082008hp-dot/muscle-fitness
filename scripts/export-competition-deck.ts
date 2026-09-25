import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import PptxGenJS from "pptxgenjs";

async function exportDeck() {
  const exportDir = path.join(process.cwd(), "MF-COMPETITION");
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const screenshotsDir = path.join(process.cwd(), "public", "competition", "export_slides");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log("Launching Chromium for PDF & PPTX export...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";

  // 1. Generate PDF Export using ?print=1
  console.log(`Loading printable presentation deck at ${baseUrl}/competition-deck?print=1...`);
  await page.goto(`${baseUrl}/competition-deck?print=1`, { waitUntil: "networkidle", timeout: 30000 });
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(3000);

  const pdfPath = path.join(exportDir, "Muscle-Fitness-Competition-Deck.pdf");
  console.log(`Generating PDF at ${pdfPath}...`);
  await page.pdf({
    path: pdfPath,
    width: "1920px",
    height: "1080px",
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  console.log("PDF generated successfully!");

  // 2. Capture 18 Individual Slide Screenshots from Interactive Deck View
  console.log("Capturing 18 individual slide frames for PPTX generation...");
  await page.emulateMedia({ media: "screen" });
  await page.goto(`${baseUrl}/competition-deck`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  const slideImagePaths: string[] = [];

  for (let i = 0; i < 18; i++) {
    // Navigate to slide index i using keyboard right arrow or select box
    const slidePath = path.join(screenshotsDir, `slide_${String(i + 1).padStart(2, "0")}.png`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: slidePath });
    slideImagePaths.push(slidePath);
    console.log(`Captured slide ${i + 1}/18: slide_${String(i + 1).padStart(2, "0")}.png`);

    if (i < 17) {
      await page.keyboard.press("ArrowRight");
    }
  }

  // 3. Build PPTX Export using PptxGenJS
  const pptxPath = path.join(exportDir, "Muscle-Fitness-Competition-Deck.pptx");
  console.log(`Building PPTX presentation at ${pptxPath}...`);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = "Muscle Fitness Competition Deck";

  for (let i = 0; i < slideImagePaths.length; i++) {
    const slide = pptx.addSlide();
    slide.background = { fill: "050607" };
    slide.addImage({
      path: slideImagePaths[i],
      x: 0,
      y: 0,
      w: "100%",
      h: "100%",
    });
  }

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  fs.writeFileSync(pptxPath, buffer);
  console.log("PPTX generated successfully at " + pptxPath);

  await browser.close();
  console.log("Export complete!");
}

exportDeck().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
