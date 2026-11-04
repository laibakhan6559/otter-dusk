# Otter Dusk

A tiny offline river game. Paddle an otter's canoe through the twilight, dodge rocks and logs, collect lanterns. Plain HTML / CSS / JS (canvas) - no build step, no dependencies.

## Controls
- **Touch:** drag your finger left / right
- **Mouse:** move the mouse left / right
- **Keyboard:** `←` `→` or `A` `D`; `P` / `Esc` pauses; `Space` / `Enter` starts

You have 3 lives. Score = distance + 10 per lantern. Best score is saved on the device.

## Run locally
Just open `index.html`, or serve the folder:

    npx serve .

## Deploy to Vercel
1. Push this folder to a GitHub repo (or run `npx vercel` inside it).
2. On vercel.com: **Add New > Project**, import the repo.
3. Framework Preset: **Other**. Leave Build Command and Output Directory empty. Deploy.

## Offline
After the first visit a service worker (`sw.js`) caches everything, so the game runs with no internet.
On a phone: open the Vercel link once, then use "Add to Home Screen" to install it like an app.
When you change any file, bump `CACHE` in `sw.js` (e.g. `otter-dusk-v2`) so players get the update.
