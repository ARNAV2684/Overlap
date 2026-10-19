# Validation and remaining checks

Date: 18 October 2026. Inspected source baseline: main `a61166b` (PR #45 and #46 merged). Implementation branch: `docs/graphify-notes`. The generated run's provenance records the exact build revision and dirty state; it is more precise than this baseline reference.

## Observed on macOS

- Isolated CPython 3.12.15 and Graphify 0.9.92 installed successfully. Application environments were not changed.
- Eleven component notes and overview written from source inspection. Every local Markdown target resolved; whitespace check passed.
- The documented Graphify API recipe produced the complete code/document graph and a separate eleven-component graph. One intermediate run contained 1,360 nodes / 3,810 edges from 188 submitted code/config files and 71 citation-indexed documents. Later documentation edits can change these counts; consult provenance for the final run.
- `graphify explain "MCP context tools"` resolved the component note and its storage, workflow, source and contract connections.
- Graphify reported 60 input files with no symbols, including placeholder modules. Configuration/file nodes do not prove semantic extraction. Full document semantic inference was not run: this milestone indexes explicit citations and declared dependencies from host-reviewed notes.
- In an isolated temporary Git fixture, tracked dummy environment/key/generated/test files were excluded before extraction; their sentinel bytes were absent from all generated artifacts.
- The fixture build succeeded with socket connections disabled. No API provider is used by the recipe; quota-failure simulation is therefore not applicable to this deterministic build. Existing assistant note review still uses normal subscription access.
- A deliberately wrong pinned version failed without changing `LATEST.txt`. A changed included file was detected by its hash without changing HEAD. Deleting fixture output preserved every source/note byte.

These temporary checks used the recipe printed in setup.md, not new repository test/helper files. Runtime match/emulator tests were not repeated because application behaviour is unchanged.

## Pending / limits

- Browser rendering/search interaction is **not visually verified**. The browser tool rejected file URLs. HTML exports succeeded, but that is not proof of a rendered browser interaction. Open the generated `components.html` / `graph.html` directly to complete this check. The renderer initially fetches its pinned JavaScript from unpkg.
- Windows installation/build has **not been executed**. PowerShell paths are documented; a teammate must record an actual run before M3 is complete.
- Component-owner factual review and successful second-laptop walkthrough remain pending.
- No Azure deployment, hosted model, runtime producer-to-consumer integration, custom dashboard or automated deep semantic inference was exercised.

## Reproduction checklist

Follow [setup](setup.md). Record OS, source revision, Graphify/Python versions, command results and provenance. Inspect the three independent paths in [overview](README.md). Review extracted/inferred labels and component status before interpreting an edge. Record browser and Windows results here in a later reviewed change; do not mark them passed from static HTML existence.
