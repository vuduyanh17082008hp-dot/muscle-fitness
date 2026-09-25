const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const outputDir = path.join(__dirname, "..", "output");
const framesDir = path.join(outputDir, "video_frames");
const audioDir = path.join(outputDir, "audio_slides");
const clipsDir = path.join(outputDir, "slide_clips");
const finalVideoPath = path.join(outputDir, "MuscleFitness_Pitch_Video_NoText.mp4");

if (!fs.existsSync(clipsDir)) {
  fs.mkdirSync(clipsDir, { recursive: true });
}

console.log("Generating 18 MP4 video clips...");
const clipFiles = [];

for (let i = 1; i <= 18; i++) {
  const idxStr = String(i).padStart(2, "0");
  const framePath = path.join(framesDir, `frame_${idxStr}.png`);
  const audioPath = path.join(audioDir, `slide_${idxStr}.wav`);
  const clipPath = path.join(clipsDir, `clip_${idxStr}.mp4`);

  // Probe audio duration using Remotion ffprobe
  const probeCmd = `npx remotion ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
  const durStr = execSync(probeCmd, { encoding: "utf8" }).trim();
  const durSec = (parseFloat(durStr) || 10) + 0.5;

  console.log(`Building clip_${idxStr}.mp4 (duration: ${durSec.toFixed(2)}s)...`);

  const ffmpegCmd = `npx remotion ffmpeg -y -loop 1 -i "${framePath}" -i "${audioPath}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -ar 48000 -ac 2 -pix_fmt yuv420p -t ${durSec.toFixed(2)} "${clipPath}"`;
  execSync(ffmpegCmd, { stdio: "inherit" });

  clipFiles.push(`clip_${idxStr}.mp4`);
}

// Build concat_list.txt inside clipsDir
const concatListPath = path.join(clipsDir, "concat_list.txt");
const concatLines = clipFiles.map((file) => `file '${file}'`).join("\n");
fs.writeFileSync(concatListPath, concatLines, "utf8");

console.log(`Saved concat list to ${concatListPath}`);

// Run FFmpeg concat in clipsDir
console.log(`Concatenating 18 clips to ${finalVideoPath}...`);
const concatCmd = `npx remotion ffmpeg -y -f concat -safe 0 -i concat_list.txt -c copy "${finalVideoPath}"`;
execSync(concatCmd, { cwd: clipsDir, stdio: "inherit" });

console.log("SUCCESS! Final MP4 video generated at:");
console.log(finalVideoPath);
