# AES67 Device Monitor Design (Replace Manual Device Level)

## Summary

Replace the existing manual "Device Monitor (UDP)" input flow with automatic AES67 device discovery and device-output-channel monitoring.

Discovery and monitoring protocol:
- Discovery multicast listener: `239.0.0.188:9996`
- Discovery packet is sent by devices periodically (every ~5s)
- Parse device identity and capabilities from discovery payload (`name`, `model`, `ip`, `phyChNumTx`, `chNumTx`, etc.)
- Level polling target: discovered device `ip:8999`
- Level command: `{"ops":"getVolumeDbBatchOut","idStart":"<N>"}` at 3 Hz

## Scope

In scope:
- Show online AES67 devices in the left panel instead of manual device-IP add form
- Show second-level draggable channel-group cards per device
- Keep right panel to 8 monitor slots (1 group card per slot)
- Start level polling only when a group card is dropped to a slot
- Stop polling when removed/replaced
- Keep meter smoothing behavior consistent with current monitor effect
- Clip visualization rule: channel `>= -2 dBFS` -> whole bar shown in red
- Offline/timeout graying behavior

Out of scope:
- SAP stream monitoring behavior changes
- DSP control features unrelated to output level polling

## UI/UX Design

### Left Panel

Primary card per discovered device:
- `name`
- `model`
- `ip`
- `phyChNumTx` (analog output count)
- `chNumTx` (network output count)
- Online/offline status indicator

Each device card has expandable second-level cards:
- Analog groups (red theme)
- Network groups (green theme)
- Group max size = 8 channels
- Group count:
  - `ceil(phyChNumTx / 8)` for analog
  - `ceil(chNumTx / 8)` for network

Examples:
- 4 analog + 4 network -> 1 analog card (4ch) + 1 network card (4ch)
- 16 analog + 16 network -> 2 analog cards (8+8) + 2 network cards (8+8)

### Right Panel (Monitoring Wall)

- Keep existing 8 slots
- One dropped second-level group card per slot
- Slot header shows source group identity (device + type + range)
- Meter labels show absolute channel index within the group context

## Data Model

### Device Entity
- `devId` (or stable derived key)
- `name`
- `model`
- `ip`
- `phyChNumTx`
- `chNumTx`
- `lastSeenAt`
- `offline` (derived: now - lastSeenAt > 15000ms)

### Monitor Group Entity (Draggable)
- `groupId` (stable)
- `deviceId`
- `deviceIp`
- `deviceName`
- `deviceModel`
- `kind`: `analog | network`
- `start`: group-local start index (0-based)
- `count`: channels in this card (1-8)
- `total`: total channels for this kind
- `globalStart`: start index in combined output array:
  - analog: `start`
  - network: `phyChNumTx + start`

## Protocol Handling

### Discovery

Desktop listens on multicast `239.0.0.188:9996`.
Device discovery packets are parsed for identity/capability.
Parser should tolerate either op label if device firmware differs (`whoIsDigisyn` or `iAmDigisyn`), but field extraction is based on payload keys.

Offline by discovery timeout:
- If no discovery packet for a device in 15 seconds:
  - Left device and its groups become gray/offline
  - Any right-slot meters from that device become gray/offline

### Level Polling

Only active for groups currently assigned to right-side slots.

Per active group:
- Send `getVolumeDbBatchOut` to device `ip:8999` at 3 Hz
- Use paging (`idStart`) when required channels are not in the first returned page
- Use `idNext` to continue until requested group range is covered or page cycle ends (`idNext == idStart`)

Array mapping:
- Returned output array order is analog first, network second
- First `phyChNumTx` values are analog outputs
- Following `chNumTx` values are network outputs

### Timeout by Level Response

For each active monitor group:
- If no valid level JSON for >10 seconds:
  - Mark that monitor source offline
  - Right-side meters for that group turn gray
  - Left corresponding group appears gray (source health degraded)

Recovery:
- On valid response resume, clear timeout state and restore normal colors.

## Meter Rules

- Keep current smoothing and peak-hold behavior consistent with existing grouped meter effect
- Clip threshold: `db >= -2 dBFS`
- On clip, the corresponding channel bar is fully red
- Non-clip channels follow existing normal color mapping
- Offline channels render gray (bar + peak indicator visually muted)

## Error Handling

- Ignore malformed UDP payloads safely
- Ignore invalid/non-JSON level responses for that poll cycle
- Keep monitor loop resilient; do not crash polling service on single-device failures
- Surface non-blocking errors to renderer as status updates

## Acceptance Criteria

1. Left panel no longer requires manual IP-based device creation for this feature path.
2. Online AES67 devices appear automatically from `239.0.0.188:9996` discovery.
3. Device cards display `name`, `model`, `ip`, analog/network output totals.
4. Second-level cards are generated with max 8 channels each and type coloring (analog red, network green).
5. Dragging a second-level card into one of 8 slots starts polling that source at 3 Hz.
6. Removing/replacing card stops polling immediately.
7. Returned arrays are interpreted as analog-first then network; channel routing to meters is correct.
8. Polling supports paging via `idStart`/`idNext` when channels are beyond first page.
9. Meter smoothing and peak hold remain visually consistent with current grouped meter behavior.
10. Any channel `>= -2 dBFS` shows full red bar for that channel.
11. If discovery is missing for >15s, related left/right cards become gray.
12. If level JSON missing for >10s for an active source, right meter and related source card become gray.
13. System recovers from gray/offline state automatically when traffic resumes.
