# SDP Parser Design

## Goal

Fix manual AES67 stream input so pasted SDP creates a usable stream card with the correct name, channel count, multicast address, and RTP port. The monitor must also allow multiple manual streams with the same multicast IP and different ports, such as `239.81.83.67:5004`, `239.81.83.67:5005`, and `239.81.83.67:5006`.

## Parsing Rules

Use one shared SDP parser for both manual input and SAP discovery. The parser should accept complete SDP and practical partial SDP. Manual input does not require `v=` or `t=` when the data needed for RTP monitoring is present.

Required data for a monitorable stream:

- Multicast or destination IP from `c=IN IP4 <ip>[/ttl]`.
- RTP port from `m=audio <port> ...`.
- Audio format, sample rate, and channel count from `a=rtpmap:<payload> <format>/<sampleRate>/<channels>`.

Name handling:

- If `s=` is present and non-empty, use it exactly after trimming. For the reported sample, the card name is `111`.
- If `s=` is missing or empty, use the existing manual fallback name for manual streams and `Unknown Stream` for SAP streams.

Defaults:

- `format` defaults to `L24` only when the format is absent.
- `sampleRate` defaults to `48000` only when absent or invalid.
- `channels` defaults to `2` only when absent or invalid.

## Stream Identity

Manual stream IDs should not be based only on IP. They should include enough data to avoid collisions and to distinguish same-IP different-port streams. A manual ID can include IP, port, and a timestamp or nonce.

SAP stream identity should remain stable for recurring SAP packets, but it should distinguish sessions that share the same origin line and advertise different destinations or ports. Include origin, IP, and port in the SAP ID source.

## Error Handling

Manual input should show the invalid SDP notification only when the data cannot produce a monitorable stream, specifically when IP or RTP port is missing or invalid. Incomplete but sufficient SDP should be accepted.

Malformed optional lines should not reject the stream. They should fall back to defaults.

## Testing

Add focused parser tests for:

- Complete sample SDP with `L24/48000/8` returns 8 channels and name `111`.
- Partial SDP without `v=` and `t=` is accepted.
- Same IP with ports `5004`, `5005`, and `5006` produces distinct manual stream IDs.
- Invalid input missing IP or port is rejected for manual add.
