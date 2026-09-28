# 岭峰建筑 (Ridgeline Builders) — construction company website

Chinese-language static site (HTML/CSS/JS, no build step) for a construction company, with a
scroll-driven hero where the build-reveal video plays as you scroll.

## How the scroll video works

The source clip (1280×720, 4s @ 24fps) is motion-interpolated to 48fps and
extracted into 191 WebP frames in `assets/frames/`, so each scroll step moves
the picture only slightly. The hero is a tall section (`420vh`) with a sticky,
full-viewport `<canvas>`. On scroll, progress through the hero maps to a frame
index, which is eased toward and drawn with `object-fit: cover` behaviour.
Frames stream in coarse-to-fine so scrubbing works before everything loads.
Three caption stages fade in and out at set progress ranges, and a progress
meter tracks the build.

To regenerate frames from a new video:

```bash
ffmpeg -i hero.mp4 \
  -vf "minterpolate=fps=48:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1" \
  -c:v libwebp -quality 64 -compression_level 6 assets/frames/f%03d.webp
```

Then update `FRAME_COUNT` in `main.js`.

## Run locally

```bash
cd construction-website
python3 -m http.server 8000
```

## Deploy

Deploy on Vercel with **Root Directory** set to `construction-website`
(framework preset: Other, no build command).

The contact form validates client-side only. Connect it to your form
backend or API route before going live.
