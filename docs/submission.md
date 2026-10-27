# Overlap: portal submission text

Ready to paste into the Innovation Studio project page, field by field (section 9 says which section goes where).
Every number has its source in section 8. One value is filled in on submission day: the live-match times
(`[[LIVE-WINDOWS]]`).

---

## 1. Project name and tagline

**Project name:** Overlap

**Tagline (one line):** Every fan watches a different match: explainable, personalised match intelligence in real time, with every number checked.

Shorter alternative (under 60 characters): *Every fan watches a different match.*

---

## 2. Elevator pitch (148 words)

Broadcasters, streamers and club apps need match intelligence that explains why a moment matters, in real time, differently for every fan. Overlap does this on synthetic football matches. A generator streams events into Azure Event Hubs; Azure Functions relay, archive and trigger; Container Apps run the stats engine and web app. Seven Microsoft Agent Framework agents on Microsoft Foundry (gpt-5-mini) spot, explain, write, fact-check, translate, direct and recap each moment, reading context through our own MCP server and Azure AI Translator. Every number comes from code and is checked before it reaches the screen; if a model line fails, a labelled stat line takes its place. Viewers choose Casual, Analyst, My club or Player focus, in English, Spanish, Hindi or French. Cosmos DB, Web PubSub, Blob Storage, Application Insights and Bicep complete a keyless, managed-identity deployment. On Azure, nine of nine full matches archived identically to their recordings.

---

## 3. Long description

### The problem

A football broadcast shows the same picture to everyone. A casual viewer wants to know why a goal mattered; an analyst wants the numbers behind a pressing change; a supporter wants their own club's story; someone following one player wants that player's night. Broadcasters, streamers and club apps want to serve all of them, live, but explanations written by a model are only useful if they are fast and trustworthy. A wrong number on screen costs more than no commentary at all.

Overlap is a working answer on synthetic data: explainable, personalised match intelligence that keeps up with the match, and a design in which every number can be traced back to code.

### The five stages

1. **Ingest.** A synthetic match generator plays whole matches possession by possession and streams events, plus every player's position at 5 Hz, into Azure Event Hubs. Each live match is the next fixture of a ten-club league, the same league the site's table and club pages show. All clubs, players and matches are invented.
2. **Interpret.** A stats engine on Azure Container Apps turns the stream into expected goals, pass difficulty, speeds and sprints, pressing, momentum, and rolling windows. Plain code, no AI. It also flags moments worth explaining and packages each one with an evidence pack: the only numbers an agent may cite. There are eleven moment types: goal, red card, penalty, milestone, shot cluster, big chance, momentum swing, press change, head-to-head, connection and workhorse.
3. **Explain.** Seven agents work on each flagged moment (below) and write why it matters, not just that it happened.
4. **Render.** A Next.js app shows a 3D pitch built from the tracking data, the live commentary strip, and insight cards (head-to-head by role, passing connections, engine room, tempo: control versus chaos and rhythm), through Azure Web PubSub. Cards are timed overlays tied to the match clock, and they are saved, so replays carry them too. Every card opens **How this card was made**: which agents ran and for how long, each model call, the MCP tools the analyst used and what it concluded, what the fact-checker sent back and why, and which translations were kept, read from the job record the agents share.
5. **Personalise.** Four modes (Casual, Analyst, My club, Player focus), four languages (English, Spanish, Hindi, French), a favourite club and a followed player. Each audience gets its own ordered stream of cards.

### The seven agents and MCP

Built with Microsoft Agent Framework on Microsoft Foundry (a gpt-5-mini deployment). The agents run only on flagged moments, never on every event.

| Agent | Role |
|---|---|
| Spotter | Code rules decide which moments get a card; optional small-model ranking of ordinary moments. |
| Analyst | Reads the moment's context through our MCP server (live state, player context, pressing, pass network, period comparison) and writes an interpretation with no numbers. |
| Narrator | Writes one line per mode, each number tied to a stored fact. Two parallel half-length calls. |
| Fact-checker | Checks every number in code, then the meaning with a separate model call. A failing line goes back to the narrator at most twice, then is replaced by a labelled template. |
| Translator | Azure AI Translator for Spanish, Hindi and French, with club and player names kept. Every translated line is re-checked. |
| Director | Rules only: timing, chart, priority and one delivery per audience group. |
| Recap writer | At full time, writes the recap from a fact pack built by code. |

The agents share one job record per moment in Cosmos DB and hand off explicitly: each stage saves its output before the next begins. A moment is claimed once under a lease, so a duplicate notification or a second worker never runs it twice, and a crashed run resumes from its last saved stage. The MCP server is ours: a read-only, per-moment, scoped server that the analyst calls as an Agent Framework tool, run in-process to avoid a 4–5 second process start per job.

Numbers come from code; words come from the agents. That split is the design.

### Personalisation

The same moment is told four ways. Casual gets a short plain line (up to 140 characters); Analyst gets the numbers (up to 220); My club tells the moment from the favourite club's side; Player focus centres the line on the followed player and shows that player's distance, top speed, sprints, and role numbers beside their opposite number's. A favourite club also steers the 3D pitch's story and filters the analytics to that club. Each language and mode has its own audience group on Web PubSub, so a viewer changes mode or language and the next card arrives in that voice.

### Results

All measured on Azure (Sweden Central) or on the evaluation bench; nothing here is an estimate unless it says so.

- **Pipeline on Azure, 24 Oct.** Nine of nine full 20× matches (SYN-3000 to SYN-3008) archived identical to their recordings. In the final run every reader was 0 s behind Event Hubs at p50, 1 s at p95 and 3 s at worst, across 3,009 function runs with none failed. A full match plays in 6 min 40 s.
- **Agents bench, 24 generated matches (538 moments).** Detection recall on every labelled trigger was 100% (195 of 195: goals, red cards, penalties, milestones, shot clusters). 0 wrong numbers in 12,236 published lines on the template path, and 0 in 2,996 more lines on a local-model subset. Fault injection on 33 labelled lines: all 11 numeric faults caught, 9 of 9 meaning faults the code can judge caught, and 0 false rejections of the 12 valid lines.
- **Cards written by the model.** At 20× a whole match takes under 7 minutes, so the agents have seconds per card. Every card says who wrote it: "AI · checked" when gpt-5-mini wrote it and the fact-checker passed it, "Stat line · checked" when a template did. Six full 20× matches on Azure (25–26 Oct) each removed one cause of late model lines: a slow MCP start, one job at a time, a strict numeric check, a breaker that paused the model, and a 15-second deadline. With 25 seconds per card (SYN-3014), 285 cards went out (118 the day before), 42 of them model-written, 29 of 81 in English. The full-time recap is now written by the model: 6 of its 7 lines passed the fact-checker on SYN-3302 (none on 25 Oct).
- **Single agent versus the full pipeline.** On the same 17 moments on gpt-5-mini, the narrator alone published 65 of 109 lines that no check could tie to the evidence (a value attached to the wrong fact, a score told from the trailing side, a missing unit). The seven agents published none of those: they rewrote 69 lines and replaced the rest with checked stat lines.
- **Line quality, scored in Foundry.** Azure AI Evaluation on 60 published lines of an Azure match (all 25 model lines and 35 templates): groundedness 98.3%, relevance 91.7%, fluency 100%.
- **Tests.** 1,271 automated tests pass across the agents, MCP server, stats engine, Functions, archiver, generator and web app, with CI on every pull request.

### Responsible AI

- **Synthetic data only.** Every club, player and match is invented by our generator; calibration targets are public aggregate statistics, cited in the repository.
- **Numbers cannot be made up.** An agent may cite only numbers from a moment's evidence pack. The fact-checker verifies each one in code; a meaning check can never overrule a numeric failure.
- **Honest labels.** "AI · checked" appears only on a model-written line that the fact-checker passed. A template line is labelled "Stat line · checked" and is never called AI.
- **Failure means a safe fallback, not silence or a guess.** Any model failure falls back to a template for that step only.
- **Translation is held to the same rule.** If Translator scrambles a number (for example reordering a score), the line is refused for that language. English is never suppressed. Numbers no longer reach Translator at all: each goes as a placeholder and is put back afterwards. On a simulated translator that moves numbers between slots, no Hindi line was dropped or wrong, where before up to 19 of 130 were dropped and 16 published wrong.
- **Traced, scored and ready to screen.** Every agent run is traced in Application Insights with no prompt or line text on any span; published lines are scored with Azure AI Evaluation; an Azure AI Content Safety screen of model lines is built and can be switched on.
- **No personal data.** No accounts, no logins; viewer preferences stay in the browser. Public match starts are limited by hashed network identifiers, and no raw addresses are stored.
- **Cost guards.** Model calls are budgeted per moment and per match in code, the model deployment has a small token-rate limit, and a model budget alerts at 50%, 80% and 100% of $25.

### Cost and operations

- **Infrastructure as code.** The whole of Azure is in Bicep and deployed with `azd`; resources use managed identities with no keys or connection strings anywhere. Local key authentication is off on Event Hubs, Cosmos DB, Web PubSub, AI Services and Translator, and shared-key access is off on Storage.
- **Operable.** Application Insights and Log Analytics collect telemetry from the Functions apps, with one trace per card from the agents; a documented pause and resume path takes the live pipeline down and brings it back with five settings.
- **Cost, estimated from list prices.** The replay-only link costs about $0.20 a day while paused. The full live pipeline is about $11–14 a day. The 24 Oct whole-day estimate, with nine full matches, was about $3. Eight subscription budgets alert at every $25 step up to $200, and public starts are rate limited (one match at a time, 3 per visitor and 6 in total per hour).

### What is next

Raise the model-written share at 20× (the agents now have 25 seconds a card; a 5× showcase gives them more); follow several players at once, and a single-metric mode; show live ball speed on its own; and automatic eventing from video, the one optional stretch goal from the challenge we did not attempt.

---

## 4. Technologies used

**AI and agents**

- Microsoft Foundry: project and a gpt-5-mini deployment (GlobalStandard), reached with managed identity
- Microsoft Agent Framework: the seven-agent workflow
- Model Context Protocol (MCP): our own per-moment, read-only stats server, used by the analyst
- Azure AI Translator: Spanish, Hindi and French
- Azure AI Evaluation: groundedness, relevance and fluency of published lines, on the Foundry deployment
- OpenTelemetry tracing from Agent Framework into Application Insights: one trace per card

**Azure data and compute**

- Azure Event Hubs (Standard; `match-events` and `match-tracking`)
- Azure Functions (Python): two apps on one B3 plan, the relay, and the archiver plus agents; eight functions with Event Hubs, Cosmos DB change-feed and timer triggers
- Azure Container Apps: web app, stats engine, and the generator as a job; Azure Container Registry
- Azure Cosmos DB (NoSQL, free tier): matches, events, stats, moments and shared agent job state
- Azure Blob Storage: per-minute tracking chunks for replays
- Azure Web PubSub (Standard): one ordered stream per audience
- Application Insights and Log Analytics
- Microsoft Entra ID managed identities and Azure RBAC: four user-assigned identities, no keys

**Delivery**

- Bicep and Azure Developer CLI (`azd`)
- GitHub Actions: lint and test on every pull request (Python, web, infrastructure)
- GitHub Copilot: in the editor and for pull request reviews

**Application**

- Python 3.12, Next.js, TypeScript, three.js, Docker

---

## 5. Category and closing paragraph

**Category: Best Multi-Agent System.** Paste this paragraph at the end of the description.

Overlap is a multi-agent system with distinct roles and one shared record. Seven agents (spotter, analyst, narrator, fact-checker, translator, director, recap writer) each own one job on a flagged match moment, and each saves its output on a shared job document in Cosmos DB before handing off to the next. The analyst reaches the evidence through our own MCP server; the fact-checker sends failing lines back to the narrator twice, then falls back to a labelled template, and a crashed run resumes from its last saved stage without ever running a moment twice. The outcome is something a single agent cannot give: personalised, translated commentary in which every number is verified in code before it is shown. On our 24-match bench, 0 wrong numbers appeared in 12,236 published lines (template path), and fault injection caught every numeric fault. On the same moments on gpt-5-mini, a single narrator agent published 65 of 109 lines no check could tie to the evidence; the seven agents published none. Every card on the site has a "How this card was made" view that shows the agents at work: which ran, their model and MCP calls, and what the fact-checker sent back and why.

---

## 6. Testing instructions

Paste into the portal's testing field. **No sign-in, no credentials, no cost to you.**

1. Open **https://ca-overlap-web.agreeablestone-46edcfef.swedencentral.azurecontainerapps.io**.
2. The home page plays a recorded match on a 3D pitch. For a good one, open `/matches` and choose **Watch replay** on **SYN-3302**, Calverholme Athletic 4–1 Orrinford Albion: five goals, a penalty, a red card and a model-written recap. SYN-3015, SYN-3016 and SYN-3301 are other fixtures of the league. Use **5×** or **20×**, with pause and restart over the pitch.
3. Watch the **commentary strip** under the pitch: the card on screen now, and the three before it. Each card shows its minute, the kind of moment, the sentence with its key number, and a badge. **AI · checked** means a model wrote the line and the fact-checker passed every number. **Stat line · checked** means a template wrote it from the verified numbers; it is never called AI. Click a card's chart link to open the chart or insight card it refers to, and **How this card was made** to see the agents' work behind it: each agent's time and model calls, the MCP tools the analyst used, and what the fact-checker sent back.
4. Below the pitch, use the viewer bar to change **Mode** (Casual, Analyst, My club, Player focus), **Language** (English, Español, हिन्दी, Français), **Club** and **Follow** (a player). The next cards arrive in that voice. Casual and Analyst are two different screens: Casual keeps to the story and a few numbers, Analyst shows every number and the facts the fact-checker verified. Player focus shows the player's distance, top speed and sprints, and their numbers beside their opposite number's.
5. Open the **recap** from `/matches` ("Recap") for the full-time summary written by the agents and every moment, and `/league` for the table, title race and style map. `/how-it-works` shows the pipeline and the seven agents.
6. The site is **paused to replays only** to save cost, so the start button is hidden. Live matches run in announced windows: `[[LIVE-WINDOWS]]`. During a window, press **Start a live match** on the home page; it plays a full match at 20× in about 7 minutes, one at a time.
7. Reconnect and layout: the page recovers on its own if the network drops; it works at phone width and in light and dark themes.

Source code: https://github.com/ARNAV2684/Overlap (judge's guide: `docs/testing.md`). All match data is synthetic.

---

## 7. Shot list: 3–5 screenshots and a thumbnail

**Do not take these now.** They need the redeployed site and the showcase replays. Take them on one desktop session, 1600×900 viewport, PNG, light theme unless noted, on a showcase replay paused on a moment where a card is visible. No browser chrome, no personal bookmarks or tabs. Invented clubs only; keep any account or email out of frame.

| # | Name | Route and state | What must be visible | Caption |
|---|---|---|---|---|
| 1 | Home | `/` on a showcase replay, 5×, a moment card over the pitch | 3D pitch, scoreboard with the live badge, top navigation, a moment card with the AI badge | "Overlap opens on a match in play: a 3D pitch built from tracking data, with agent-written, fact-checked cards." |
| 2 | Match with commentary | `/replay/<showcase id>`, scroll so the commentary strip and the insight cards share the frame | Commentary strip with at least one "AI · checked" and one "Stat line · checked" card, replay bar with moment marks, head-to-head card | "Live commentary: every line says who wrote it, and every number is checked in code." |
| 3 | Player Focus | Same match, Mode set to Player focus, a player followed | Ring and name tag on the pitch, the Player focus panel with the opposite number's comparison, a card centred on that player | "Player focus: the same moment, from one player's night, against their opposite number." |
| 4 | Recap | `/match/<showcase id>/recap` in Analyst mode, language Hindi if the cards are clean, otherwise English | Final score, the recap text, the moment timeline | "The full-time recap, written from a fact pack built by code, in the viewer's mode and language." |
| 4b | How this card was made | `/replay/SYN-3302`, Analyst, a goal card's **How this card was made** open | The drawer: agents in order with their times, model call chips, the analyst's MCP tools, the fact-check rounds | "Every card shows the agents at work: who ran, what they read through MCP, and what the fact-checker sent back." |
| 5 | Architecture | `docs/img/azure-deployment.png` | Generator, Event Hubs, the two Functions apps, Container Apps, Cosmos DB, Blob, Web PubSub, Foundry (gpt-5-mini), Translator, Application Insights, the viewer; managed identity noted | "Deployed on Azure, Sweden Central: event-driven, keyless, defined in Bicep." |

Optional sixth: the **Overlap live run** workbook in Application Insights during a live window (cards sent and expired, agent stage times, model calls), if it is deployed by then.

**Thumbnail** (16:9, 1280×720 minimum, PNG, under 2 MB): the 3D pitch from the Wide camera with one moment card in the focus colour, the wordmark "Overlap" and the tagline "Every fan watches a different match." in large type. Use the dark theme if the card reads better there. No club badges that resemble real ones, no music-service or league logos, no text smaller than 28 px.

---

## 8. Source check

Every count and number above, with where it comes from. Checked 25 Oct 2026 against the files named; rows from "Tests" down were added or updated in the evening, at `main` `1a60777`.

| Claim | Value | Source |
|---|---|---|
| Elevator pitch length | 148 words (inside 100–150) | Counted with a script on the text in section 2 |
| Matches archived identical on Azure | 9 of 9, SYN-3000 to SYN-3008 | `plans/active/PLAN_infra_azure-pass.md` (A8) |
| Reader lag | 0 s p50, 1 s p95, 3 s worst; 3,009 function runs, 0 failed (SYN-3008) | Same, A8 latency |
| Match duration at 20× | 6 min 40 s | Same; `infra/README.md` says "about 7 minutes" (rounded), used in testing step 6 |
| Bench size | 24 matches, 538 moments | `agents/evals/results/round-1/report.md` |
| Recall | 100% on goal 87/87, red card 11/11, penalty 2/2, milestone 27/27, shot cluster 68/68 = 195/195 | Same, detection table |
| Wrong numbers | 0 in 12,236 published lines (+604 recap), template path; 0 in 2,996 (+144 recap), local-model subset | Same. Note: the 12,236 lines are the template path, so this is a statement about the checker and templates, not about model quality; the text says "on the template path" |
| Fault injection | 33 lines: valid 12, numeric 11, meaning 10; numeric caught 11/11, meaning caught 9 of the 9 code-checkable (1 code-blind); 0 false rejections | Same, fault injection |
| Moment types | 11 | `CONTRACTS.md` lines 634–635; `agents/specs/agents.md` (sprint is deferred) |
| Agents | 7 | `agents/README.md`; `web/src/app/how-it-works/page.tsx` |
| Modes, languages | 4 modes, 4 languages | `web/src/lib/preferences.ts` lines 29–35; `web/specs/screens.md` §3 |
| Line limits | casual 140, analyst 220 characters | `agents/specs/agents.md` §3 |
| Rewrites | at most 2, then template | `agents/specs/agents.md` §4; `agents/config.py` |
| Tracking rate | 5 Hz | `generator/README.md`; `web/src/app/how-it-works/page.tsx` |
| Functions | 8 functions, two apps, B3 plan, 1 instance | `functions/README.md`; `infra/modules/functions.bicep` line 55; `PLAN_infra_azure-pass.md` Wave 2. (`functions/README.md` says Flex Consumption; the Bicep and `infra/README.md` say B3, which is what is deployed) |
| Event Hubs | Standard, `match-events` and `match-tracking` | `infra/modules/event-hubs.bicep`; `infra/README.md` |
| Web PubSub | Standard S1 while live | `infra/modules/web-pubsub.bicep` |
| Cosmos DB | NoSQL, free tier | `infra/modules/cosmos.bicep` line 55 |
| Model | gpt-5-mini, GlobalStandard | `infra/modules/foundry.bicep` lines 22, 91 |
| Managed identities | 4 user-assigned; local auth off on Event Hubs, Cosmos, Web PubSub, AI Services, Translator; shared keys off on Storage | `infra/specs/security.md` §1, §2 |
| Budgets | eight overall ($25 to $200 in $25 steps); model budget $25 with alerts at 50/80/100% | `infra/specs/costs.md` §1 |
| Paused cost | about $0.20 a day, plus the always-warm web app (at most about $1.30 a day) | `infra/specs/costs.md`; `PLAN_infra_azure-pass.md` ($0.17 a day) |
| Live cost | about $11–14 a day | Estimate from list prices: `infra/specs/costs.md` §2 ($5.5–8 a day) plus Cosmos DB at 4,000 RU/s ($5.8 a day while set) |
| 24 Oct whole-day cost | about $3, list-price estimate | `PLAN_infra_azure-pass.md` A8, "Cost" |
| Start limits | one match at a time; 3 per visitor and 6 global per hour | `docs/release-readiness.md`; `web/README.md` (PR #97, on `fix/local-release-readiness`) |
| Pause and resume | five settings | `infra/README.md` "Pause" and "Resume" |
| In-process MCP | removes a 4–5 s process start per job | `docs/release-readiness.md` (lines 29–35) |
| CI | workflows `infra.yml`, `pr-checks.yml`, `python.yml`, `web.yml` | `.github/workflows` |
| Tests | 1,271 passing | Run on `main` at `0ac714b` on 27 Oct: agents 284; MCP 150 (3 skipped); stats 76 (1 skipped); functions 20; generator 113 (2 skipped); archiver 5 (2 skipped, need the storage emulators); web 623 (4 skipped). The same table is in `README.md` |
| Model-written share on Azure | 42 of 285 cards on SYN-3014 (29 of 81 in English); 5–16% across the four 25 Oct runs | `docs/evaluation.md`, "Live AI share on Azure"; `agents/evals/results/live-SYN-3014/report.md` |
| Model-written recap | 6 of 7 recap lines on SYN-3302 (26 Oct); 0 of 7 on SYN-3013 | `agents/evals/results/live-SYN-3302/recap.md`; the recap timeout #114 fixed in `live-SYN-3014/report.md` |
| League fixtures live | Each live match is the season's next round-robin fixture (10 clubs, 90 fixtures) | `generator/batch.py` (`season_fixture`), `infra/containers/generator.Dockerfile` (`--from-season`) |
| Time per card at 20× | 25 s per moment on Azure (15 s until 26 Oct); a card may show up to 10 match minutes after its moment | `infra/modules/functions.bicep` (`OVERLAP_MOMENT_DEADLINE_S`); `CONTRACTS.md` §10.6 |
| Single vs multi-agent | Same 17 moments; single agent 65 of 109 lines refused by the code check; seven agents 0, 69 rewritten | `agents/evals/results/single-vs-multi-azure/report.md`; `docs/evaluation.md` |
| Foundry evaluation | 60 lines (25 model, 35 template): groundedness 98.3%, relevance 91.7%, fluency 100% | `agents/evals/results/foundry-1/report.md` |
| Hindi placeholders | 0 dropped and 0 wrong at every simulated swap rate; before, up to 19 dropped and 16 wrong of 130 | `agents/evals/results/hindi-numbers/report.md` (100% swap row) |
| Tracing | One trace per card, no line text on any span | `agents/specs/observability.md` §1–§2 |
| GitHub Copilot | Used in the editor and for pull request reviews | The team's confirmation, 25 Oct; `docs/microsoft-stack.md` |

---

## 9. Field list for the portal (what to paste where)

| Portal field | Paste |
|---|---|
| Project name | Section 1 |
| Tagline / short description | Section 1 |
| Elevator pitch | Section 2 |
| Description | Section 3 plus the chosen paragraph from section 5 at the end |
| Technologies | Section 4 |
| Category | Best Multi-Agent System (section 5) |
| Demo video URL | https://www.youtube.com/watch?v=o707LHVlM3Q (public YouTube, under 2:00) |
| Repository URL | https://github.com/ARNAV2684/Overlap |
| Live URL | https://ca-overlap-web.agreeablestone-46edcfef.swedencentral.azurecontainerapps.io |
| Testing instructions | Section 6 |
| Images | Section 7 (3–5 screenshots, the architecture PNG, a thumbnail) |

After submitting, keep this file as the record of what was entered.

