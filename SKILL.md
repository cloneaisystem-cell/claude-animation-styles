---
name: animation-styles
description: Make one of 9 short 9:16 animations with the user's own words, rendered locally with Remotion - particles (a portrait out of 10,000 dots), flight-path (3D globe flight), neon (sign on a wet brick wall), case-board (detective cork board), origami (paper crane), exploded (labelled exploded view), front-page (newspaper spin), watercolor (pigment bloom), stat-3d (3D growth number). Use when the user types /animation-styles, /particles, /flight-path, /neon, /case-board, /origami, /exploded, /front-page, /watercolor or /stat-3d, or asks for one of these animations.
---

# Animation styles: 9 looks, your words

Usage: `/neon OPEN late` · `/flight-path Paris to New York` · `/particles me.jpg` · `/case-board who stole my charger?` …
Or: `/animation-styles <style> <words>`.

The Remotion project lives in `template/` next to this file. Paths below are relative to `template/`.
Each style is a finished, working animation in `src/styles/`. You make the user's version by copying it and changing the words, not by writing it from scratch. The creative brief of every style is in `prompts/<style>.md` (next to this file).

## 1. First run only: set up
- Check `node --version`: it must be 18 or newer. If Node is missing, tell the user to install the LTS version from nodejs.org (or `winget install OpenJS.NodeJS.LTS` on Windows, `brew install node` on a Mac), then stop.
- If `template/node_modules` is missing, run `npm install` in `template/`. It takes a few minutes the first time.
- Renders download a headless browser once (~100 MB) and load fonts from Google Fonts, so the first render needs internet.
- Remotion bundles its own ffmpeg. Python is not needed.

## 2. Understand the request
- **Style:** match the command or word to one of the 9 below (ignore case and small typos). If none matches, list them and ask.
- **Words:** everything after the command. If there are none, make the default version (the one from the reel) and tell the user they can add their own words next time.

| Style | Component (`src/styles/`) | The user's words change | Keep |
|---|---|---|---|
| particles | `Particles.tsx` | the photo: copy their image into `public/my/` and point `staticFile(...)` at it. Best: a profile or portrait with a bright or rim-lit background. | the dot count, the snap, the timing |
| flight-path | `FlightPath.tsx` | the two cities: `A`, `B` (lat/lon), the labels, the "FROM → TO" line and the km number (compute the great-circle distance; don't guess) | the globe, the jet, the pin |
| neon | `Neon.tsx` | the two lines of the sign (short: line 1 ≤ 6 letters, line 2 ≤ 12) | the brick wall, the write-on, the flicker |
| case-board | `CaseBoard.tsx` | the case title, the 4 suspects' captions, the cards and notes, the culprit and the verdict word | the board, the string, the marker circle |
| origami | `Origami.tsx` | the paper colour (front and back) | the folds and the crane |
| exploded | `Exploded.tsx` | the 6 label names. Another object means rebuilding the 3D parts: say so and offer the camera with new labels first. | the camera, the lights |
| front-page | `FrontPage.tsx` | the paper's name, the headline, the subhead, the caption | the spin and the slam |
| watercolor | `Watercolor.tsx` | the title and the colours of the sky, sun and hills | the bloom |
| stat-3d | `Stat3D.tsx` | the brand name, the number (+ or %), the label, the accent colour | the 3D bars and the floor |

Never use a real company's logo or a real person's face unless the user owns it or has the right to use it.

## 3. Make it
1. Pick a short id: `<style>-<one word>`, e.g. `neon-lisbon`.
2. Copy `src/styles/<Component>.tsx` to `src/my/<id>.tsx`. Imports like `../theme` keep working from there.
3. In the copy, change only what the table says: the words, the cities, the colours, the photo path. Keep the timing, the motion and the look. Long text must still fit: shorten it or reduce that font size.
4. Register it in `src/my/index.ts`:
   ```ts
   import { Neon as NeonLisbon } from "./neon-lisbon";
   // inside MY:
   { id: "neon-lisbon", base: "neon", Style: NeonLisbon },
   ```
5. Check 3 stills before the video: the start, just after the cut, and the end.
   ```
   npx remotion still src/index.ts neon-lisbon out/neon-lisbon-a.png --frame=10
   ```
   Use frames 10, 60 and the last frame minus 5. Look at them. Fix any text that overflows or is cut off, and anything that is unreadable, then check again.
6. Render the video into the folder the user started Claude Code in:
   ```
   npx remotion render src/index.ts neon-lisbon "<the user's folder>/neon-lisbon.mp4"
   ```
   Output: 1080×1920, 60 fps, about 2–2.5 s, no sound.
7. Tell the user where the file is. Then offer one tweak, e.g. "Want it in another colour, or longer?"

## 4. If something goes wrong
- **WebGL or blank frames** (globe, origami, exploded, stat-3d): add `--gl=angle` to the command. On Linux use `--gl=swangle`.
- **"Font failed to load":** the render needs internet for Google Fonts. Retry when online.
- **The render is slow:** normal on a laptop for the 3D styles. Add `--concurrency=2`.
- **Anything else:** read the error, fix it, and explain the fix in one sentence.

## Licences
The code is MIT. Remotion is free for individuals and companies of up to 3 people (remotion.dev/license). The fonts come from Google Fonts (OFL). The map data is Natural Earth via world-atlas.
