# Real-pose regression fixtures

MoveNet Lightning keypoints (12 body points, face points dropped, x/y rounded
to 0.1 px, score to 0.01) extracted at 10 Hz by SetVision's own collector
(`components/setvision/collect-pose-frames.ts`) from openly licensed clips on
Wikimedia Commons, on 2026-11-01. Only the derived keypoints are stored here —
never the video. Row format: `[timestampMs, x, y, score × keys]`, `offsetMs` =
where the slice starts in the source clip.

| Fixture | Source file (Wikimedia Commons) | Author | Licence | Footage |
|---|---|---|---|---|
| bench | Bench press - exercise demonstration video.webm | FitnessScape | CC BY 3.0 | rendered 3D animation, front-oblique |
| incline | Incline press - exercise demonstration video.webm | FitnessScape | CC BY 3.0 | rendered 3D animation, front-oblique |
| pullup | Pull-ups - exercise demonstration video.webm | FitnessScape | CC BY 3.0 | rendered 3D animation, rear-oblique |
| shoulderpress | Shoulder press - exercise demonstration video.webm | FitnessScape | CC BY 3.0 | rendered 3D animation, front |
| row | Bent-over row - exercise demonstration video.webm | FitnessScape | CC BY 3.0 | rendered 3D animation, front-oblique |
| pulldown | Common Lat Pulldown Mistakes.webm | Andrew Kwong (DeltaBolic) | CC BY 3.0 | real, edited compilation (cuts, overlays) |
| curl | Video of EZ Bar Curl and Straight Bar Curl.webm (35–60 s, re-encoded) | Colossus Fitness | CC BY 3.0 | real, edited (cuts, close-ups), front |
| ohp | Muscle Strengthening at the Gym - Overhead Press.webm (from 15 s) | U.S. CDC | Public domain | real, machine press, front, 320×240 |
| chestpress | Muscle Strengthening at the Gym - Chest Press.webm (from 15 s) | U.S. CDC | Public domain | real, machine press filmed head-on, 320×240 |

Rendered clips are pose inputs, not real-world evidence. None of these is a
labelled benchmark: the expected counts in `real-pose.test.ts` were checked
by eye against frame sheets of each clip (see docs/setvision.md). They pin
current behaviour on real pose noise; they are not accuracy figures.
