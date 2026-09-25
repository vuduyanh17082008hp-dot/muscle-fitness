# Muscle Fitness — Competition Deck Export & Presentation Guide

This guide provides instructions for launching, navigating, presenting, and exporting the **Muscle Fitness 18-Slide Competition Deck**.

---

## 1. PRESENTING LIVE IN THE BROWSER

1. Launch local development server or open live deployment:
   ```bash
   npm run dev
   ```
2. Navigate to:
   `http://localhost:3000/competition-deck`

3. Click **PRESENT** or press **F11** to enter Fullscreen Presentation Mode.

### Keyboard Shortcuts
- **Right Arrow / Space / PageDown**: Advance to Next Slide
- **Left Arrow / Backspace / PageUp**: Return to Previous Slide
- **Home**: Jump to Slide 01 (Opening)
- **End**: Jump to Slide 18 (Closing)
- **ESC**: Exit Fullscreen Mode
- **Dropdown Selector**: Jump directly to any slide

---

## 2. EXPORTING TO PDF & PPTX

### Automated Script (Playwright & pptxgenjs)
Run the automated export script:
```bash
npx tsx scripts/export-competition-deck.ts
```

This will automatically:
1. Start headless browser to render `/competition-deck?print=1`
2. Capture high-resolution screenshots of all 18 slides at `1920x1080`
3. Generate `MF-COMPETITION/Muscle-Fitness-Competition-Deck.pdf`
4. Generate `MF-COMPETITION/Muscle-Fitness-Competition-Deck.pptx`

---

## 3. MANUAL PRINT TO PDF (BROWSER BACKUP)

1. Open `http://localhost:3000/competition-deck?print=1`
2. Open Chrome/Edge Print Menu (**Ctrl + P** or **Cmd + P**).
3. Select **Save as PDF**.
4. Set **Layout**: `Landscape` (16:9).
5. Set **Paper Size**: `Tabloid` / `Custom 16in x 9in` or `A4 Landscape`.
6. Enable **Background Graphics**.
7. Set **Margins**: `None`.
8. Click **Save** to export `Muscle-Fitness-Competition-Deck.pdf`.
