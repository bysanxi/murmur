# murmur / 三息之间

[中文](./README.zh.md) | English

> Breathe in the quiet, flow in the stillness.

A desktop healing wallpaper project built on [Deskulpt](https://github.com/deskulpt-apps/Deskulpt).  
It switches dynamic illustrations and short sentences by time of day, leaving three tiny breaths in front of the computer.

- Project code: `murmur`
- Chinese name: 三息之间
- Domain: [murmur.yoga](https://murmur.yoga)
- Foundation: Deskulpt
- Positioning: A subtle emotional companion / micro-break trigger on the desktop
- Status: Early concept and prototype stage

---

## What It Is

It is not a traditional wallpaper app, nor a therapy tool or productivity tool.

It is more like a **small window, a little note, a tiny breathing space on your desktop**.

Users do not need to open any interface; the desktop itself is the medium.  
In a fleeting glance at the desktop, they get **three seconds of pause, breath, and feeling understood**.

Core content forms:

- **Dynamic illustrations**: subtle motion, low distraction, naturally looping
- **Healing short sentences**: 1–3 lines, readable at a glance, non-preachy
- **Passive glance**: automatic switching as the default, manual switching as secondary
- **Time-based switching**: content changes automatically according to morning, late morning, lunch break, afternoon, evening, late night, etc.

It should not be:

- A therapy tool
- A productivity tool
- A check-in / habit-tracking tool
- A preachy tool

---

## Core Philosophy

### Three Tiny Breaths a Day

`三息之间` corresponds to:

- Between work and work
- Between messages and messages
- Between tasks and tasks
- Between emotions and emotions

In these gaps, pause for a moment, and be gently held.

### A Sense of Non-Intrusion

- Automatic switching first, manual switching second
- No check-ins, points, or leaderboards
- No notifications like "You haven't looked today"
- Do not create new anxiety
- Like a quiet roommate, not a boss rushing you

### No Chicken Soup, Just Human Words

- Avoid "you should"; prefer "you can", "it's also okay", "it's fine"
- Do not force positivity; be able to hold fatigue, anxiety, loneliness, and self-doubt
- Illustration and text are one; not arbitrary image-text pairing

---

## Feature Direction

### Confirmed Direction

- Dynamic illustrations + healing short sentences / micro-stories
- Passive glance, automatic switching
- Original content
- Time-based switching
- General audience
- No commercialization
- No long-term records / healing album for now (revisit in a later version)

### Time Periods and Content Tone

| Time Period | Time Range (Example) | Content Tone |
|-------------|----------------------|--------------|
| Morning | 6:00 - 9:00 | Light, soft, starting |
| Late Morning | 9:00 - 12:00 | Steady, quiet, breathing |
| Lunch Break | 12:00 - 14:00 | Relaxed, everyday, human |
| Afternoon | 14:00 - 18:00 | Warm, companionable, not hyped |
| Evening | 18:00 - 21:00 | Wrapping up, ending, transitioning |
| Late Night | 21:00 - 6:00 | Calm, quiet, companionable |
| Weekend / Holiday | — | Slow, loose, purposeless |

### Content Themes

- Nature, animals, people, everyday objects, abstract, window views, clouds, plants
- Emotional categories: fatigue, anxiety, loneliness, self-doubt, numbness, calm, hope

---

## Technical Direction

### Foundation: Deskulpt

Deskulpt is a cross-platform desktop customization tool that lets you define widgets as React components and render them directly on the desktop.

This project uses the following Deskulpt capabilities:

- **Sink mode**: widgets are non-interactive while the desktop remains usable, ideal for "passive glance"
- **Z-index control**: set to a negative value so the wallpaper sits beneath desktop icons
- **Full-screen coverage**: achieved visually through position `(0,0)` plus size matching the screen resolution
- **React + WebView**: naturally supports CSS / SVG / Lottie / Three.js dynamic content

### Dynamic Illustration Technology Choices

| Option | Use Case |
|--------|----------|
| CSS Animation + SVG | Lightweight micro-motion (breathing, drifting, light shifts) |
| Lottie | Character micro-actions, more complex illustration animation |
| Three.js / WebGL | 3D scenes (e.g., top-down fish school, water surface, particles) |
| Canvas | Special particle effects |

Preferred approach: **CSS + SVG** as the default, with **Three.js** for standout content in specific scenes.

### Time-Based Switching Implementation

Inside the React widget, use `useEffect` + `setInterval` to periodically check the current time period, select matching content from the content pool, and transition with fade in/out.

### Performance and Power Consumption

- Keep motion subtle to avoid sustained high CPU / GPU load
- Use `requestAnimationFrame` or CSS `will-change` to optimize rendering
- Avoid running multiple complex animations at the same time
- Consider automatically reducing animation frequency in battery mode
- Pause or degrade animations when a full-screen app is running

---

## Project Structure (Planned)

```text
murmur/
├── widgets/                 # Deskulpt widgets
│   └── healing-wallpaper/
│       ├── deskulpt.widget.json
│       ├── index.jsx
│       ├── components/      # Illustration layer, text layer, scheduler
│       ├── content/         # Built-in content pool
│       └── assets/          # Illustrations, animation assets
├── packages/                # Shared logic (content scheduling, time period detection)
├── docs/                    # Design principles, content guidelines
└── README.md
```
