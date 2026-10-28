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

## 2026-10-27 - Photo story component on scroll-driven animations
The story chapters here (pinned photo, crossfade at each chapter, words that fade in and out with scroll) could be a small web component that turns any list of dated photos into a scroll story, for launch trackers, team histories or product changelogs.
The fades use CSS scroll-driven animations (`animation-timeline: view()`), now in Chrome and Safari, so they need no scroll listener.
Effort: small (extract `src/ui/story.ts` and its CSS, take the chapters as JSON).
Links: https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timeline/view
Status: proposed.

## 2026-10-28 - External trigger as a backup for the GitHub cron
GitHub can start scheduled runs hours late or skip them, most of all on new repositories.
A free external scheduler (cron-job.org) or a Cloudflare Worker cron can call the `workflow_dispatch` API every 30 minutes with a fine-grained token limited to Actions on this repository, so updates do not depend on GitHub's scheduler.
A small hosted "reliable cron for GitHub Actions" with run-delay alerts is a possible product; several people ask for it in the GitHub community forum.
Effort: small (one token, one scheduler entry; the workflow already accepts `workflow_dispatch`).
Links: https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event, https://github.com/orgs/community/discussions/201738
Status: proposed, needs a fine-grained token and a scheduler account from the user.
