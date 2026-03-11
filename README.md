# Street Hustle

Street Hustle is a story-driven, Kampala-inspired idle tycoon built as a static web app. Players grow from small daily hustles into a multi-district business network through missions, achievements, story events, and local-first progression.

## Live

- Production: https://cruze-intelligent.github.io/Street-Hustle/

## How To Play

- Start with `Wash Clothes` and tap manually until your first upgrades begin compounding.
- Spend cash to unlock more hustles, then push them to automation so income keeps running in the background.
- Claim missions, achievements, streak rewards, comeback boosts, and the install reward to build Street Cred faster.
- Use Street Cred plus district mission goals to unlock the next part of Kampala and expand your hustle network.
- Specialize hustles with tracks and story-event choices once the basics are stable.

## Project Structure

- `index.html`: app shell and screen layout
- `css/styles.css`: relaunch visual system and responsive layout
- `js/core/`: app controller, engine, UI manager, rewards, cloud sync, and helpers
- `data/`: districts, hustles, missions, events, and studio metadata
- `service-worker.js` and `manifest.webmanifest`: PWA support

## Local Run

Serve the directory with any static server and open the site in a browser:

```bash
python3 -m http.server
```

Then visit `http://localhost:8000/`.

## Notes

- Core gameplay works offline after the service worker is installed.
- Cloud save is optional and uses PlayFab only when the device is online.
- For the cleanest install flow, use Safari on iPhone/iPad or Chrome, Edge, or Samsung Internet on Android and desktop.
- Developer details and studio copy are configured in `data/studio.json`.
