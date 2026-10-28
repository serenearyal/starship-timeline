# Ideas

## 2026-10-27 - Earth-from-orbit web component
The sky shader here (ray-traced Earth, scattering atmosphere, airglow, city lights) could ship as a drop-in web component or npm package for space apps, launch trackers and museum kiosks.
Effort: medium (extract `src/scene/sky.ts` and `atmosphere.ts`, add a WebGPU path through Three.js TSL).
Links: https://threejs.org/docs/#api/en/renderers/webgpu/WebGPURenderer
Status: proposed.

## 2026-10-27 - Weekly digest with the Claude API
A weekly workflow job could summarize the week's Starship news and flight changes into a short "what changed" note on the site and as an RSS item.
Effort: small (one API key secret, one extra step in the workflow).
Links: https://docs.claude.com/en/api/overview
Status: proposed, needs an Anthropic API key as a repository secret.

## 2026-10-27 - Feed of new flights and date changes
The pipeline already knows when a flight date or status changes, so it could write `feed.xml` and let people subscribe in any feed reader or get pushed to Slack or Discord.
Effort: small.
Status: proposed.
