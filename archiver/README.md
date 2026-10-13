# Archiver

Reads every event and stores it permanently, so replays never depend on Event Hubs retention. Tracking frames are
stored as compressed per-minute chunks in Blob Storage, not as one document per frame.
