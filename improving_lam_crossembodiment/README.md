# Project website

Static, single-page project site for *Improving Cross-embodiment Transfer in Latent Action Models with Action-Similarity Supervision*.

- `index.html` — the whole page (HTML, CSS and vanilla JS; no build step, no external requests). Light theme by default; the sun/moon button in the top bar switches to dark mode and the choice is remembered in the browser.
- `assets/` — paper PDF, the paper's Fig. 1 (`method.*`) and Fig. 2 (`setup.*`), robot renders, and the 12 head-camera frames in `rollouts/` (`proper_*` = own tasks, `inverse_*` = transfer rollouts).

The result charts are drawn from data arrays at the bottom of `index.html`; every number there comes from Table I, Table II and Fig. 4 of the paper.

## Preview locally

```bash
python3 -m http.server 8765 --directory website
```

then open <http://localhost:8765/>.

## Deploy

Any static host works (GitHub Pages, Netlify, a lab web server): publish the `website/` folder as-is.
For GitHub Pages, either point Pages at a branch whose root contains these files, or copy `website/` to a `gh-pages` branch.

## Things still to fill in

- `arXiv (soon)` button in the hero: replace with the arXiv link once available.
- `Code` button: currently points at this repository; change if the public code lives elsewhere.
- `#video-placeholder` in the setup section: drop rollout MP4/WebM files in `assets/` and replace the frame `<figure>`s with `<video>` elements.
- BibTeX block: update `note`/venue once the paper is published.
- `og:image` in `<head>`: set to the absolute URL of `assets/method.png` after deployment.
