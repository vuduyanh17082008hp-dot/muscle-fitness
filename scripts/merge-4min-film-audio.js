const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const outputDir = path.join(__dirname, "..", "output");
const video4MinPath = path.join(outputDir, "muscle-fitness-competition-film-4min.mp4");
const audioDir = path.join(outputDir, "audio_slides");
const musicDir = path.join(outputDir, "music_tracks");

const finalOutputVideo = path.join(outputDir, "MuscleFitness_Pitch_Video_4Min_Complete.mp4");
const noTextVideo = path.join(outputDir, "MuscleFitness_Pitch_Video_NoText.mp4");

if (!fs.existsSync(video4MinPath)) {
  console.error("4-minute video file not found at " + video4MinPath);
  process.exit(1);
}

console.log("Processing audio alignment for 4-minute film (240.0 seconds)...");

// 1. Combine all 18 slide audio clips with 1.22x speed adjustment to fit 238 seconds
const voiceoverMasterPath = path.join(outputDir, "voiceover_4min_master.wav");

const slideAudioList = [];
for (let i = 1; i <= 18; i++) {
  const idxStr = String(i).padStart(2, "0");
  const audioPath = path.join(audioDir, `slide_${idxStr}.wav`);
  if (fs.existsSync(audioPath)) {
    slideAudioList.push(audioPath);
  }
}

// Build concat list for voiceover
const voiceoverConcatFile = path.join(audioDir, "voiceover_concat.txt");
const concatLines = slideAudioList.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n");
fs.writeFileSync(voiceoverConcatFile, concatLines, "utf8");

// Concat and apply atempo=1.22 to fit 240 seconds
console.log("Creating synchronized voiceover master track...");
const concatVoiceCmd = `npx remotion ffmpeg -y -f concat -safe 0 -i "${voiceoverConcatFile}" -filter_complex "atempo=1.22,apad=whole_dur=240" -ar 48000 "${voiceoverMasterPath}"`;
execSync(concatVoiceCmd, { stdio: "inherit" });
console.log("Voiceover master track generated.");

// 2. Synthesize 4-minute 3-Act Background Music
const bgm4MinPath = path.join(musicDir, "bgm_4min_master.wav");
console.log("Synthesizing 4-minute 3-Act instrumental background music...");

const act1Path = path.join(musicDir, "act1_4min.wav");
const act2Path = path.join(musicDir, "act2_4min.wav");
const act3Path = path.join(musicDir, "act3_4min.wav");

// Act 1 (0:00 - 1:15 = 75s) Cinematic Ambient C minor
execSync(`npx remotion ffmpeg -y -f lavfi -i "sine=frequency=65.4:duration=75" -f lavfi -i "sine=frequency=130.8:duration=75" -f lavfi -i "sine=frequency=196.0:duration=75" -f lavfi -i "sine=frequency=311.1:duration=75" -filter_complex "[0:a][1:a][2:a][3:a]amerge=inputs=4,volume=0.06[out]" -map "[out]" -ar 48000 "${act1Path}"`, { stdio: "inherit" });

// Act 2 (1:15 - 3:15 = 120s) Corporate Tech Ab major
execSync(`npx remotion ffmpeg -y -f lavfi -i "sine=frequency=103.8:duration=120" -f lavfi -i "sine=frequency=155.5:duration=120" -f lavfi -i "sine=frequency=207.6:duration=120" -f lavfi -i "sine=frequency=261.6:duration=120" -filter_complex "[0:a][1:a][2:a][3:a]amerge=inputs=4,volume=0.08[out]" -map "[out]" -ar 48000 "${act2Path}"`, { stdio: "inherit" });

// Act 3 (3:15 - 4:00 = 45s) Uplifting Build C major (fade out 2s)
execSync(`npx remotion ffmpeg -y -f lavfi -i "sine=frequency=130.8:duration=45" -f lavfi -i "sine=frequency=196.0:duration=45" -f lavfi -i "sine=frequency=261.6:duration=45" -f lavfi -i "sine=frequency=329.6:duration=45" -filter_complex "[0:a][1:a][2:a][3:a]amerge=inputs=4,volume=0.09[out]" -map "[out]" -ar 48000 "${act3Path}"`, { stdio: "inherit" });

// Concat BGM acts
const bgmConcatFile = path.join(musicDir, "bgm_4min_concat.txt");
fs.writeFileSync(bgmConcatFile, `file 'act1_4min.wav'\nfile 'act2_4min.wav'\nfile 'act3_4min.wav'`, "utf8");
execSync(`npx remotion ffmpeg -y -f concat -safe 0 -i bgm_4min_concat.txt -c copy "${bgm4MinPath}"`, { cwd: musicDir, stdio: "inherit" });

// 3. Mix Voiceover (0dB) + BGM (-22dB ducked = volume 0.08) into master audio track
const masterAudioPath = path.join(outputDir, "audio_4min_master.wav");
console.log("Mixing voiceover + background music with -22dB ducking...");
const mixAudioCmd = `npx remotion ffmpeg -y -i "${voiceoverMasterPath}" -i "${bgm4MinPath}" -filter_complex "[1:a]volume=0.08[bgm]; [0:a][bgm]amix=inputs=2:duration=first[outa]" -map "[outa]" -ar 48000 "${masterAudioPath}"`;
execSync(mixAudioCmd, { stdio: "inherit" });

// 4. Mux master audio onto the 4-minute video film
console.log("Muxing complete audio onto 4-minute video film...");
const finalMuxCmd = `npx remotion ffmpeg -y -i "${video4MinPath}" -i "${masterAudioPath}" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest "${finalOutputVideo}"`;
execSync(finalMuxCmd, { stdio: "inherit" });

// Copy to MuscleFitness_Pitch_Video_NoText.mp4
fs.copyFileSync(finalOutputVideo, noTextVideo);

console.log("\n==================================================");
console.log("SUCCESS! FULLY MERGED 4-MINUTE VIDEO CREATED AT:");
console.log(finalOutputVideo);
console.log(noTextVideo);
console.log("==================================================\n");
