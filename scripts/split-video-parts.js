const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const outputDir = path.join(__dirname, "..", "output");
const inputFile = path.join(outputDir, "MuscleFitness_Pitch_Video_4Min_Complete.mp4");

if (!fs.existsSync(inputFile)) {
  console.error("Input video file not found at " + inputFile);
  process.exit(1);
}

const part1 = path.join(outputDir, "MuscleFitness_Pitch_Part1_Hook_Problem.mp4");
const part2 = path.join(outputDir, "MuscleFitness_Pitch_Part2_System_Product.mp4");
const part3 = path.join(outputDir, "MuscleFitness_Pitch_Part3_Safety_Impact.mp4");

console.log("Splitting full video into 3 smaller parts (80 seconds each)...");

// Part 1: 0:00 to 1:20 (80s)
console.log("Generating Part 1 (0:00 - 1:20)...");
execSync(`npx remotion ffmpeg -y -ss 00:00:00 -i "${inputFile}" -t 80 -c copy "${part1}"`, { stdio: "inherit" });

// Part 2: 1:20 to 2:40 (80s)
console.log("Generating Part 2 (1:20 - 2:40)...");
execSync(`npx remotion ffmpeg -y -ss 00:01:20 -i "${inputFile}" -t 80 -c copy "${part2}"`, { stdio: "inherit" });

// Part 3: 2:40 to 4:00 (80s)
console.log("Generating Part 3 (2:40 - 4:00)...");
execSync(`npx remotion ffmpeg -y -ss 00:02:40 -i "${inputFile}" -t 80 -c copy "${part3}"`, { stdio: "inherit" });

console.log("SUCCESS! Split into 3 parts:");
console.log("Part 1:", part1);
console.log("Part 2:", part2);
console.log("Part 3:", part3);
