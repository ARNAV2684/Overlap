# Demo video script (2:00)

Screen recording of the live link with a voice-over. Invented clubs and players only; no real logos, broadcast
footage or copyrighted music (silence or our own sound only). Record during a live window on Azure, with a replay of
the same match as a fallback for any shot.

| Time | On screen | Voice-over |
|---|---|---|
| **0:00–0:10** The problem | A plain score ticker, then cut to the Overlap home page | "A match feed tells every fan the same thing: the score. But a casual fan, an analyst, a club's supporter and a fan in Delhi all want a different match." |
| **0:10–0:40** A live match on Azure | Press **Start a live match**; the 3D pitch fills with players; the score header, story caption and chips; an AI moment card rises over the pitch with **AI · checked**; the chart chip opens its chart | "This match is being played right now by our synthetic engine on Azure: every event and every player's position, five times a second, through Event Hubs and Functions to this screen in about a second. When something matters, seven agents explain it, and the card says whether a model wrote it and that every number was checked." |
| **0:40–1:10** One moment, four viewers | Pause on one moment. Switch the mode: **Casual** → **Analyst** → **My club** (pick a club) → language **हिन्दी**. Show the same card changing each time; then **Follow** a player for a second | "Same moment, four fans. Casual gets the story. Analyst gets the numbers behind it. My club tells it from your side. And in Hindi, the names and every number come through unchanged. Each viewer reads their own stream, so two people watching together see different cards." |
| **1:10–1:35** How a card is made | The **How it works** page, the seven agents; then, if the card-trace panel is deployed by recording day, one card's trace (agents, MCP tool calls, fact-check result) | "A moment from the stats engine starts a job. The spotter ranks it. The analyst reads the match through our MCP server: pressing, the pass network, this spell against the last. The narrator writes a line for every audience. The fact-checker checks every number in code against the evidence and the meaning with a second model; a wrong line goes back twice, then becomes a checked stat line. Then translator, director, and one card per audience through Web PubSub." |
| **1:35–1:50** Architecture and numbers | The architecture diagram from the README; then the results list | "All on Azure, from Bicep, with managed identity and no keys: Foundry and gpt-5-mini, Agent Framework, Event Hubs, Functions, Container Apps, Cosmos DB, Web PubSub. Nine full matches archived identical to their recordings, every reader within a second at p95, 3,009 function runs with none failed, and zero wrong numbers in over twelve thousand checked lines." |
| **1:50–2:00** Close | The match screen in Player focus, then the wordmark and the link | "Overlap. Every fan watches a different match." |

## Shot notes

- Before recording: pick the moment for 0:40–1:10 in advance (a goal or a big chance with a model-written card).
- Keep the cursor still while cards rise; use the replay's pause to hold a card on screen.
- Use the numbers from [`evaluation.md`](evaluation.md); if the next Azure run gives a measured share of AI-written
  cards, add it to the 1:35 line.
- Captions on, so the video works muted.
