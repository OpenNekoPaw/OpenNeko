## Current design

One Clip uses one authorized native video source. Chromium owns Range scheduling, demux, decode and seek.
The Cut renderer does not fetch bytes or append MSE buffers. Main prepares only inputs that require bounded
remux/hardware conversion, publishes them after completion and revokes them by session/generation.

The next Clip's video and PCM may preconnect without mutating the active clients. Promotion occurs only
after first-frame and bounded audio readiness. One monotonic Timeline clock survives handoff. Same-Clip
paused seek updates native time; cross-Clip seek atomically selects the latest prepared generation.

PCM becomes stereo before normalization and receives final peak safety. One AudioContext owns adjacent
generations and retires the previous gain smoothly. Stop, seek, View dispose and app quit release every
resource and process.
