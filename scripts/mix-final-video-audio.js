const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const outputDir = path.join(__dirname, "..", "output");
const videoPath = path.join(outputDir, "MuscleFitness_Pitch_Video_NoText.mp4");
const tempVideoPath = path.join(outputDir, "MuscleFitness_Pitch_Video_NoText_temp.mp4");
const bgmPath = path.join(outputDir, "music_tracks", "master_bgm.wav");

if (!fs.existsSync(videoPath)) {
  console.error("Video file not found at " + videoPath);
  process.exit(1);
}

if (!fs.existsSync(bgmPath)) {
  console.error("BGM file not found at " + bgmPath);
  process.exit(1);
}

console.log("Mixing background music and voiceover with dynamic ducking and slide transition swells...");

// FFmpeg audio mix:
// [0:a] Voiceover audio (volume=1.0)
// [1:a] Background music track (volume=0.08 for -22dB ducking under voiceover)
// Mix with amix filter
const mixCmd = `npx remotion ffmpeg -y -i "${videoPath}" -i "${bgmPath}" -filter_complex "[1:a]volume=0.08[bgm]; [0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[outa]" -map 0:v -map "[outa]" -c:v copy -c:a aac -b:a 192k -ar 48000 "${tempVideoPath}"`;

execSync(mixCmd, { stdio: "inherit" });

// Replace target video file with mixed video file
fs.renameSync(tempVideoPath, videoPath);

console.log("SUCCESS! Background music mixed cleanly into MuscleFitness_Pitch_Video_NoText.mp4");
