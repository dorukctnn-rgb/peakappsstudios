# Peak Apps Studio: media brief

The site is complete without any of these files. Each video slot shows a still by default. To switch one on, upload its files and change `data-video-enabled="false"` to `"true"` on that slot in `index.html`. The page then checks for `<base>.mp4` after load and fades the loop in. The upgrade is skipped on phones, under Save-Data or reduced motion, and on low-memory devices, so the still stays the fallback.

Only four assets are worth commissioning. Two can be generated. Two must be real captures, because the site never shows invented product UI.

---

## 1. Hero atmosphere loop (generate)

**Where:** Hero background layer, behind the real product windows.
- `media/hero/hero.webm`
- `media/hero/hero.mp4`
- `media/hero/poster.webp`

**Concept:** A dark graphite space where soft light moves across brushed metal and smoked glass. It is only atmosphere. The product windows in HTML sit on top of it, so the video must never contain UI, text, logos or devices.

**Prompt:**
> Slow cinematic push through an abstract dark studio space. Deep obsidian black background. Large floating panes of smoked glass and brushed graphite metal hang at different depths, softly out of focus. A single cool silver key light sweeps slowly from right to left, catching thin specular edges on the panes. Fine atmospheric haze, very subtle floating dust in the light beam. Restrained, premium, quiet. Monochrome palette: black, graphite, silver, faint cool blue in the highlights. No text, no screens, no user interfaces, no logos, no people, no neon, no lens flares, no particles swarming. Shot on a large-format cinema camera, shallow depth of field, 35mm lens, soft contrast, film grain.

| | |
|---|---|
| Duration | 10 s seamless loop |
| Master | 3840×2160; deliver at 1920×1080 |
| Aspect | 16:9 (the layer uses `object-fit: cover`) |
| Camera | Continuous dolly-in of about 3% scale, with a lateral drift of about 2% of frame width. No cuts, no rotation. |
| Lighting | One moving key light from upper right, very low fill, highlights never clipped |
| Loop strategy | Keep the camera path circular so the last frame matches the first. If the model can't do that, crossfade the final 1.0 s into the first 1.0 s in the edit. Check the loop point at 200% zoom. |
| Text-safe area | The left 50% and the bottom 40% of the frame must stay near-black (luma below 12%). The headline and buttons sit there, and the page adds a dark gradient over that area. |
| Encoding | WebM: VP9, two-pass, CRF 34, no audio, ≤ 2.5 MB. MP4: H.264 High, CRF 26, `-movflags +faststart`, no audio, ≤ 3.5 MB. |
| Poster | Frame 0 exported as WebP, 1920×1080, quality 78, ≤ 120 KB |

On screen the layer plays at 55% opacity under a left-to-right gradient. It should read as moving light, not as footage.

---

## 2. BodyArcade gameplay clip (real capture, not generated)

**Where:** The full-bleed BodyArcade chapter (`01`). It replaces the still Volcano frame.
- `media/work/bodyarcade-gameplay.webm`
- `media/work/bodyarcade-gameplay.mp4`

**Concept:** Eight seconds of a real run: the road, an obstacle approaching, a successful squat or jump, the score ticking up. It's the most persuasive asset the studio has, because the product is visual and the footage is genuine.

**How to capture:**
1. Open `bodyarcade.com/BodyArcade.html?world=volcano` on a desktop with a good GPU, at 2560×1440 in fullscreen.
2. Record with OBS at 60 fps (or 30 fps if needed), CRF 16. Play a real run with the camera on. Crop out the webcam preview if it appears.
3. Pick an 8-second stretch with at least one obstacle and a clean pass. Avoid game-over screens.

| | |
|---|---|
| Duration | 8 s, looped in the page |
| Resolution | 1920×816 (the chapter is about 2.35:1). Crop the top HUD bar and the flat ground band at the bottom. |
| Camera | The game camera itself. No added motion. |
| Loop strategy | Loops are hard cuts in a runner. End on a stretch of empty road and start on empty road, then add a 0.4 s dip through a dark frame. |
| Text-safe area | The left 40% carries the product copy under a dark gradient. Keep action and obstacles centre-right. |
| Encoding | WebM: VP9, CRF 33, ≤ 3 MB. MP4: H.264, CRF 25, faststart, ≤ 4 MB. No audio. |

Other worlds are available with `?world=sunset|storm|city|desert` if one reads better.

---

## 3. iOS app screenshots (real, from App Store Connect)

**Where:** The "On the App Store" section. The monogram tiles for Travio, Leano and OBBB Saver become device renders.
- `assets/apps/travio-1.webp`
- `assets/apps/leano-1.webp`
- `assets/apps/obbb-1.webp`

**Concept:** One hero screen per app. It should show the moment the app is for: a scam verdict in Travio, the body map in Leano, the savings total in OBBB Saver.

**Spec:**
- Export the 6.9-inch App Store screenshot (1320×2868), or take a real device screenshot. Use a screen without marketing text overlays.
- Deliver WebP at 660×1434, quality 80, ≤ 90 KB each.
- Don't mock or re-draw screens. If an app doesn't have a representative screen yet, keep the monogram.

The markup change is small: add an `<img>` inside each `.app-glyph` or replace it. The styles for rounded device corners are already in `.phone img`.

---

## 4. Studio still (optional, real photograph)

**Where:** Above "How we work", as one full-width image.
- `assets/studio.webp`

**Concept:** One real photograph of where the products are made, such as a desk, a laptop and a test phone. Keep it in low light, close to monochrome. If no suitable photograph exists, skip this asset: the section works without it.

**Direction:** Available light only, one side light, deep shadows. Desaturate to about 10% colour. Crop to 21:9. Keep people unidentifiable or out of frame unless they have agreed to appear.

| | |
|---|---|
| Resolution | 2400×1030 master; deliver WebP 1600×686, quality 76, ≤ 160 KB |
| Text-safe area | None. The image stands alone between sections. |

---

### Not recommended

Don't commission generated "app screenshots", fake dashboards, stock footage of people using phones, or anything taken from another creator's video. The site's credibility comes from showing only real product surfaces.
