# MCP server

Exposes match stats as MCP tools for the tactical analyst (and any MCP client).

The folder is called `mcp_server` (not `mcp`) so it can never shadow the official `mcp` Python SDK.

## Define before you code

| # | Spec | What it decides | Governs |
|---|---|---|---|
| 1 | [`specs/tools.md`](specs/tools.md) | The tool list; each tool's description, inputs, output and an example call; which data each reads; limits; how clients connect | every file here |

## Files

| File | Job |
|---|---|
| `server.py` | The MCP server |
| `data_access.py` | Reads match state, events and season data |
| `tools/match_state.py` | `get_match_state` |
| `tools/compare_periods.py` | `compare_periods` |
| `tools/pressing.py` | `get_pressing_window` |
| `tools/player_context.py` | `get_player_context` |
| `tools/pass_network.py` | `get_pass_network` |
| `tools/season.py` | `get_season_milestones` |
