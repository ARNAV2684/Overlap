# Live mode, batch mode and realism report spec

> **Status: not started.** Write and agree this before coding `live.py`, `batch.py`, `realism_report.py` and `cli.py`.

Decides how matches are played out: streamed live, or generated as a full season with a realism report.

## 1. Live mode

- Which speeds are supported (1×, 5×, 20×)?
- How are events and tracking frames sent to Event Hubs (partition key, batching)?
- What happens on a send failure?

_Answer:_

## 2. Recorded matches

- What file format does a recorded match use (setup + events + tracking chunks)?
- Where are recorded matches saved?

_Answer:_

## 3. Batch mode

- How many matches per season, and how is the fixture list built?
- Where are season files stored?

_Answer:_

## 4. Realism report

- Which metrics does it compare with CALIBRATION.md, and how are they charted?

_Answer:_

## 5. Command line

- Which commands and options does the CLI expose?

_Answer:_
