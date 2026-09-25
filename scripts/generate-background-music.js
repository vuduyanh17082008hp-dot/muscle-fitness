const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const outputDir = path.join(__dirname, "..", "output");
const musicDir = path.join(outputDir, "music_tracks");

if (!fs.existsSync(musicDir)) {
  fs.mkdirSync(musicDir, { recursive: true });
}

console.log("Synthesizing 3 instrumental cinematic ambient background music tracks...");

// Act 1: Cinematic Ambient (0:00 - 1:30, 90 seconds) — C Minor Harmonic Pad
const act1Path = path.join(musicDir, "act1_cinematic.wav");
const act1Cmd = `npx remotion ffmpeg -y -f lavfi -i "sine=frequency=65.4:duration=90" -f lavfi -i "sine=frequency=130.8:duration=90" -f lavfi -i "sine=frequency=196.0:duration=90" -f lavfi -i "sine=frequency=311.1:duration=90" -filter_complex "[0:a][1:a][2:a][3:a]amerge=inputs=4,volume=0.06[out]" -map "[out]" -ar 48000 "${act1Path}"`;
execSync(act1Cmd, { stdio: "inherit" });
console.log("Act 1 generated.");

// Act 2: Corporate Tech Uplifting (1:30 - 3:30, 120 seconds) — Ab Major Harmonic Pad
const act2Path = path.join(musicDir, "act2_corporate.wav");
const act2Cmd = `npx remotion ffmpeg -y -f lavfi -i "sine=frequency=103.8:duration=120" -f lavfi -i "sine=frequency=155.5:duration=120" -f lavfi -i "sine=frequency=207.6:duration=120" -f lavfi -i "sine=frequency=261.6:duration=120" -filter_complex "[0:a][1:a][2:a][3:a]amerge=inputs=4,volume=0.08[out]" -map "[out]" -ar 48000 "${act2Path}"`;
execSync(act2Cmd, { stdio: "inherit" });
console.log("Act 2 generated.");

// Act 3: Uplifting Build (3:30 - 5:23, 113 seconds) — C Major Warm Resolution
const act3Path = path.join(musicDir, "act3_build.wav");
const act3Cmd = `npx remotion ffmpeg -y -f lavfi -i "sine=frequency=130.8:duration=113" -f lavfi -i "sine=frequency=196.0:duration=113" -f lavfi -i "sine=frequency=261.6:duration=113" -f lavfi -i "sine=frequency=329.6:duration=113" -filter_complex "[0:a][1:a][2:a][3:a]amerge=inputs=4,volume=0.09[out]" -map "[out]" -ar 48000 "${act3Path}"`;
execSync(act3Cmd, { stdio: "inherit" });
console.log("Act 3 generated.");

// Concatenate Acts 1, 2, 3 into master_bgm.wav using concat list
const concatListPath = path.join(musicDir, "bgm_concat_list.txt");
const concatContent = `file 'act1_cinematic.wav'\nfile 'act2_corporate.wav'\nfile 'act3_build.wav'`;
fs.writeFileSync(concatListPath, concatContent, "utf8");

const masterBgmPath = path.join(musicDir, "master_bgm.wav");
console.log("Concatenating Acts 1, 2, 3 into master_bgm.wav...");
const concatCmd = `npx remotion ffmpeg -y -f concat -safe 0 -i bgm_concat_list.txt -c copy "${masterBgmPath}"`;
execSync(concatCmd, { cwd: musicDir, stdio: "inherit" });

console.log("Master background music track generated at: " + masterBgmPath);
