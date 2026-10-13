# Web app

Next.js (App Router, TypeScript): the viewer's screen.

| Planned piece | Job |
|---|---|
| Live 2D pitch | Ball and players, tweened between position updates |
| Moment cards | Agent explanation + a chart as proof + a "verified" badge |
| Stat panels | Possession, xG, shots, PPDA, momentum, control ↔ chaos |
| Viewer modes | Casual, analyst, player focus; favourite club; language |
| Replay | Any recorded match at 1×, 5× or 20× |
| Agent trace | The agent chain for each moment, made visible |

One message format (the envelope in [`CONTRACTS.md`](../CONTRACTS.md#7-envelope-everything-sent-to-browsers)) feeds
the screen from snapshots, the live socket and replay files alike.
