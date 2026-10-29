# Avs Tracker

A Colorado Avalanche roster page with season stats, injury status, and a player report card. It's a static site for GitHub Pages, and a scheduled GitHub Action refreshes the data.

## How it works

- `scripts/fetch-data.mjs` pulls the roster and season stats from the NHL's public API (`api-web.nhle.com`) and the injury report from ESPN's public feed. It merges them into `data/avs.json`.
- `.github/workflows/update-data.yml` runs that script every 3 hours and commits `data/avs.json` when something changed.
- `index.html`, `style.css`, and `app.js` read `data/avs.json` and draw the table and report cards. The browser never calls the NHL or ESPN directly, so there are no CORS problems.

## Setup

1. Create a new repo (e.g. `Avs-Tracker`) and upload everything in this folder, including the hidden `.github` folder.
2. **Settings → Actions → General → Workflow permissions** → choose **Read and write permissions** → Save. Without this, the workflow can't commit the data file.
3. **Settings → Pages** → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
4. **Actions** tab → **Update Avs data** → **Run workflow**. This creates `data/avs.json` the first time.
5. When "pages build and deployment" finishes, open `https://<your-username>.github.io/Avs-Tracker/`.

## Captains

The NHL API doesn't include captaincy, so it lives in `data/captains.json`. Edit the names there if the letters change.

## Notes

- The injury info is whatever ESPN lists. Expect the status (Out, Day-To-Day, Injured Reserve) reliably. Body part and return date appear only when the team discloses them.
- Players ESPN lists as injured who aren't on the active roster (e.g. long-term IR) appear in a box below the table.
- To refresh on demand (say, after a game), use **Run workflow** on the Actions tab.
- Both data sources are unofficial and could change without notice. If the page stops updating, check the workflow's log on the Actions tab.
- Data © NHL and ESPN, for personal, non-commercial use.
