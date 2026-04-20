# FairCall Line Judge

FairCall Line Judge is a browser-based prototype that analyzes sports footage to help decide whether a fast ball/shuttle landed on the line (**IN**) or outside (**OUT**).

It is designed for sports where speed makes line calls difficult:

- Table Tennis
- Pickleball
- Padel
- Badminton

## Why this exists

In fast rallies, players and coaches often disagree about close calls. Without a referee or replay system, it is hard to judge fairness consistently. This tool provides an assistive software workflow to reduce disputes by analyzing video frames and highlighting probable bounce + line-contact events.

## Core features

- **Two source modes**:
  - Uploaded video clip (default)
  - Live camera feed
- **Sport presets** for table tennis, pickleball, padel, badminton.
- **Manual line calibration**:
  - Sliders (`X1/Y1/X2/Y2`) or
  - Click two points directly on the canvas.
- **Frame-by-frame assistance** for uploaded clips:
  - Timeline scrub
  - Play/Pause
  - Step +1 frame
- **Detection pipeline**:
  - Frame differencing for motion
  - Bright-object filtering
  - Target centroid estimation
  - Bounce-turn detection (vertical direction change)
  - Contact scoring near the configured line band
- **Decision output** with confidence and event log (`IN` / `OUT`).

> Important: This is a prototype support tool for fairness and experimentation, not a certified officiating system.

## Run locally

```bash
npm start
```

Open: `http://localhost:3000`

## Recommended usage flow

1. Upload a rally clip (or switch to live camera mode).
2. Select sport preset.
3. Calibrate the line location (click two points or use sliders).
4. Tune thresholds to match lighting/background.
5. Use log entries and confidence output to review close calls.
