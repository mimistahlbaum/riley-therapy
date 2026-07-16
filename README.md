<img src="public/riley.webp" alt="Riley (Character)" width="100">

# Riley — Emotional Wellness Companion

**Riley** is a friendly companion who helps children notice, name and manage their feelings using the [Zones of Regulation](https://zonesofregulation.com) framework.

This repository contains two versions:

| Version | Where it runs | Status |
| --- | --- | --- |
| **Web app** (`docs/`) | Any modern browser, plus VR/AR headsets via WebXR | ✅ Current, full version |
| **Unity demo** (`Assets/`) | Meta Quest via Unity + Convai | 🗄️ Original 2025 prototype (kept for reference) |

## The web app

The web app is a complete rebuild of the 2025 prototype. It runs entirely in the browser with no installs, accounts or API keys, and the same page works on:

- **Desktop and mobile browsers**: interact with Riley in a friendly 3D world
- **VR headsets (e.g. Meta Quest)**: open the page in the headset browser and press **Enter VR**, or **Enter AR** for passthrough, then point and click with the controllers

### What's included

Everything the prototype had, plus the parts it left unfinished:

- **All four zones**: Blue, Green, Yellow and Red are fully implemented (the demo covered Yellow only). Riley's chest heart glows the colour of your zone.
- **Check-in conversation**: Riley asks how you feel, reflects the feeling back, identifies the zone and offers matching tools. The flow is scripted and predictable, which keeps it dependable and safe for children, with no external AI service required.
- **11 regulation tools**: balloon breathing, dragon breaths, 5-4-3-2-1 grounding, counting, rocket countdown, squeeze and let go, push the wall, star stretch, cozy care, talk it out, three happy things and a mindful minute. Breathing tools are guided by an animated balloon.
- **Toolbox in the conversation**: Riley offers the toolbox once a feeling is on the table, so tools always follow a check-in naturally.
- **Learn**: kid-friendly explanations of all four zones and their feelings, available from the settings sheet.
- **Feelings journal**: check-ins are remembered locally on the device (never uploaded), so children and carers can look back together. Also in the settings sheet.
- **An animated Riley**: the character now blinks, bobs, waves, nods and celebrates (the prototype used a static, unrigged model).
- **Riley speaks**: messages are read aloud with a local Zundamon speech server when one is running, then Microsoft's online neural voice, then the browser's built-in speech synthesis. Voice can be switched off.
- **Calm background music**: "Infinite Peace" by Kevin MacLeod (public domain, CC0 via FreePD.com) loops quietly behind the conversation, dips while Riley talks and can be switched off in settings.
- **Accessible, child-friendly design**: large touch targets, keyboard focus states, reduced-motion support and a bright rounded look.

### Privacy

The app is a static site. There are no accounts, no analytics, no API keys and no network calls at runtime. The journal is stored in the browser's local storage only.

Riley is a practice buddy, not a therapist. The conversation consistently encourages children to involve a trusted adult when feelings stay big.

### Run it locally

Any static file server works:

```bash
cd docs
python3 -m http.server 8080
# then open http://localhost:8080
```

### Deploy to GitHub Pages

The repository ships with a workflow (`.github/workflows/deploy-pages.yml`) that publishes `docs/` automatically:

1. In the repository settings, go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Merge or push to `main`. The site will be published at `https://<user>.github.io/riley-therapy/`.

Alternatively, without the workflow: set **Source** to **Deploy from a branch**, choose `main` and the `/docs` folder.

### Using it on a VR headset

1. Open the GitHub Pages URL in the headset's browser (e.g. Meta Quest Browser).
2. Press **Enter VR** (fully virtual) or **Enter AR** (passthrough, like the original AR demo).
3. Point at Riley's floating panel with either controller and pull the trigger to choose answers. The panel mirrors the whole conversation, including breathing activities and tools.

### Tech notes

- [Three.js](https://threejs.org) (vendored in `docs/js/vendor/`, MIT licence) with WebXR for VR/AR
- Riley is built procedurally in code — no model files to download, so the app loads fast
- Web Speech API for Riley's voice, with graceful fallback when unavailable
- No build step: plain ES modules, deployable as-is

## The original Unity demo (2025)

The Unity project in `Assets/` is the original prototype featuring Riley as an LLM-powered assistant in augmented reality, created by **Team Spot** during the Winter School on AI for XR (July 14–18, 2025), organised by Professor Mark Billinghurst at the University of South Australia. It uses Unity with Meta XR and [Convai](https://www.convai.com/) narrative design, and requires a Convai API key and a Meta Quest device (or the Meta XR Simulator).

Known limitations of the prototype (all addressed in the web app): only the Yellow Zone was implemented, the model was static and unrigged, spawning was random, and a Convai API key with quota was required.

<details>
<summary>Unity demo setup instructions (archived)</summary>

1. Get your Convai API Key:
   - Sign up for a free account at [Convai](https://convai.com).
   - Select the key icon in the top right corner of the Convai dashboard, and copy the API Key.
2. Install [Unity](https://unity.com/download)
3. Clone this repository using Git.
4. Add the project in the cloned repository to Unity Hub.
5. Open the project in Unity. (It may take some time to load initially.)
6. In Unity, go to the menu bar → "Convai" → "API Key Setup" to set the Convai API Key you copied earlier.
7. In Unity, go to the Assets panel → open `Scenes/Main` to open the scene.
8. In Unity, select the ▶️ (Play) button on top of the screen, then the Meta XR Simulator will be launched.

For Meta Quest, go to "File" → "Build and Run" with your device connected via USB and developer mode enabled. Press the A button on the right controller (or the B key in the simulator) to start a conversation.

</details>

## Members of Team Spot

- Manabu Nakazawa ([@mshibanami](https://github.com/mshibanami))
- Michelle Emery ([@MichelleEmery](https://github.com/MichelleEmery))
- Mimi Yoshii-Podger ([@mimistahlbaum](https://github.com/mimistahlbaum))
- Yin Ye ([@2xY-Design](https://github.com/2xY-Design))

## Special Thanks

- [Professor Mark Billinghurst](https://people.unisa.edu.au/Mark.Billinghurst) for organizing the Winter School on AI for XR, which provided the opportunity to learn about AI for XR and to work on this project.
- Tamil Selvan ([@GTamilSelvan07](https://github.com/GTamilSelvan07)) for helping us with Convai and Unity.
- Zirui Xiao ([@FrostyAlien](https://github.com/FrostyAlien)) for helping us with Unity.
