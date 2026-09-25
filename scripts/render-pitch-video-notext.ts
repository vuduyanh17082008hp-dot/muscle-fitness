import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

async function renderPitchVideoNoText() {
  const outputDir = path.join(process.cwd(), "output");
  const framesDir = path.join(outputDir, "video_frames");
  const clipsDir = path.join(outputDir, "slide_clips");
  const audioDir = path.join(outputDir, "audio_slides");
  const finalVideoPath = path.join(outputDir, "MuscleFitness_Pitch_Video_NoText.mp4");

  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
  if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir, { recursive: true });

  console.log("Launching Chromium browser for no-text visual frame capture...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";

  console.log(`Loading no-text interactive presentation deck at ${baseUrl}/competition-deck?notext=1...`);
  await page.goto(`${baseUrl}/competition-deck?notext=1`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  const slideFramePaths: string[] = [];

  for (let i = 0; i < 18; i++) {
    const idxStr = String(i + 1).padStart(2, "0");
    const framePath = path.join(framesDir, `frame_${idxStr}.png`);

    await page.waitForTimeout(400);
    await page.screenshot({ path: framePath });
    slideFramePaths.push(framePath);
    console.log(`Captured no-text visual frame ${i + 1}/18 -> frame_${idxStr}.png`);

    if (i < 17) {
      await page.keyboard.press("ArrowRight");
    }
  }

  await browser.close();

  // Create individual slide video clips combined with audio using npx remotion ffmpeg
  console.log("Combining no-text visual frames with synthesized audio tracks...");
  const clipPaths: string[] = [];

  for (let i = 0; i < 18; i++) {
    const idxStr = String(i + 1).padStart(2, "0");
    const framePath = path.join(framesDir, `frame_${idxStr}.png`);
    const audioPath = path.join(audioDir, `slide_${idxStr}.wav`);
    const clipPath = path.join(clipsDir, `clip_${idxStr}.mp4`);

    if (!fs.existsSync(audioPath)) {
      console.error(`Audio file missing for slide ${idxStr}: ${audioPath}`);
      continue;
    }

    // Get exact audio duration using npx remotion ffprobe
    const probeCmd = `npx remotion ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
    const durationSecStr = execSync(probeCmd, { encoding: "utf8" }).trim();
    const durationSec = parseFloat(durationSecStr) || 10;
    // Add 0.5s pause padding after slide key point
    const paddedDurationSec = (durationSec + 0.5).toFixed(2);

    console.log(`Slide ${idxStr}: Audio duration = ${durationSec.toFixed(2)}s -> Clip duration = ${paddedDurationSec}s`);

    // Combine frame PNG + audio WAV into clip MP4 with Remotion FFmpeg (1080p, 30fps, H.264, AAC 48kHz)
    const ffmpegCmd = `npx remotion ffmpeg -y -loop 1 -i "${framePath}" -i "${audioPath}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -ar 48000 -ac 2 -pix_fmt yuv420p -t ${paddedDurationSec} "${clipPath}"`;
    execSync(ffmpegCmd, { stdio: "ignore" });

    clipPaths.push(clipPath);
    console.log(`Generated clip_${idxStr}.mp4`);
  }

  // Concatenate all 18 slide clips into final MP4 video
  console.log("Concatenating all 18 slide clips into final video...");
  const concatListPath = path.join(clipsDir, "concat_list.txt");
  const concatContent = clipPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n");
  fs.writeFileSync(concatListPath, concatContent, "utf8");

  const concatCmd = `npx remotion ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${finalVideoPath}"`;
  execSync(concatCmd, { stdio: "ignore" });

  console.log(`SUCCESS! Final video generated at: ${finalVideoPath}`);
}

renderPitchVideoNoText().catch((err) => {
  console.error("Rendering failed:", err);
  process.exit(1);
});
