# Stats engine

Plain, deterministic code: no AI. It consumes ordered events, keeps the match state and publishes numbers.

1. **Dedupe and order** by `seq` (delivery is at-least-once).
2. **Per event:** xG, pass distance and difficulty, ball and shot speed.
3. **Rolling 5 and 10 minute windows:** momentum, PPDA, press height, tempo, control ↔ chaos.
4. **Whole match:** totals, pass network, player zones, distance, sprints.
5. **Publish:** a match-state snapshot, stat panels about once a second, and moment triggers with an
   **evidence pack**: the only numbers the agents may cite.

Metric definitions are in [`CONTRACTS.md`](../CONTRACTS.md#8-metric-definitions-stats-engine).
