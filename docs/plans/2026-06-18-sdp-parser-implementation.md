# SDP Parser Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make manual and SAP SDP parsing accept practical partial SDP, preserve `s=` names such as `111`, parse 8-channel `L24/48000/8`, and allow same multicast IP with different RTP ports.

**Architecture:** Add one shared parser module used by both `App.tsx` manual input and `electron/services/SapDiscovery.js`. The parser returns normalized SDP fields and leaves source-specific stream ID and fallback naming to callers. Keep monitoring behavior unchanged.

**Tech Stack:** React 19, TypeScript, Vite, Electron, Node UDP APIs.

---

### Task 1: Add Shared SDP Parser

**Files:**
- Create: `utils/sdp.ts`
- Test: `utils/sdp.test.ts` or temporary Node/TypeScript validation script if no test runner is added.

**Step 1: Write parser behavior tests**

Cover:
- `s=111`, `c=IN IP4 239.81.83.67/32`, `m=audio 5004 RTP/AVP 97`, `a=rtpmap:97 L24/48000/8` parses name `111`, IP `239.81.83.67`, port `5004`, channels `8`, sampleRate `48000`, format `L24`.
- Partial SDP without `v=` and `t=` is accepted.
- Missing `c=` or invalid `m=` marks the parsed result as not monitorable.
- CRLF and LF input both parse.

**Step 2: Implement parser**

Create exported functions:

```ts
export interface ParsedSdp {
  name?: string;
  ip?: string;
  port?: number;
  channels: number;
  sampleRate: number;
  format: string;
  origin?: string;
  isMonitorable: boolean;
}

export function parseSdp(text: string, fallbackIp?: string): ParsedSdp {
  // Normalize CRLF/LF, trim lines, parse s/c/m/o/a=rtpmap.
}
```

Rules:
- `name` comes from non-empty `s=`.
- `ip` comes from `c=` with `/ttl` stripped, else `fallbackIp`.
- `port` comes from `m=audio <port>`.
- `a=rtpmap` parses payload value after the first space, not by splitting the whole line blindly.
- Defaults are `format=L24`, `sampleRate=48000`, `channels=2`.
- `isMonitorable` is true only when IP exists and port is a positive integer.

**Step 3: Validate parser**

Run: `npm run build`

Expected: TypeScript and Vite build succeed.

### Task 2: Use Parser for Manual SDP Input

**Files:**
- Modify: `App.tsx`
- Modify: `types.ts` only if needed.

**Step 1: Replace inline parsing**

In `handleAddSdp`, call `parseSdp(sdpInput)`.

Manual behavior:
- Reject only when `parsed.isMonitorable` is false.
- Use `parsed.name || t.unnamedManual`.
- Use `parsed.ip`, `parsed.port`, `parsed.channels`, `parsed.sampleRate`, `parsed.format`.
- Generate ID from IP, port, and timestamp or nonce, for example `manual-${parsed.ip}-${parsed.port}-${Date.now()}`.

**Step 2: Verify same-IP different-port stream creation**

Manually inspect code path or run a small validation that three parsed SDPs with `239.81.83.67` and ports `5004`, `5005`, `5006` produce distinct IDs and stream objects.

**Step 3: Build**

Run: `npm run build`

Expected: Build succeeds.

### Task 3: Use Parser for SAP Discovery

**Files:**
- Modify: `electron/services/SapDiscovery.js`
- Potentially create: `electron/services/sdpParser.js` if importing TypeScript from Electron runtime is not suitable.

**Step 1: Share runtime-compatible parser**

Because Electron services run directly as JavaScript, either:
- Move the shared parser to JavaScript with TypeScript-friendly exports, or
- Keep a small JavaScript parser module and import equivalent logic from the frontend.

Prefer avoiding build-time coupling surprises in Electron. If needed, create `utils/sdp.js` plus TypeScript declarations or use plain JavaScript import where both runtimes can consume it.

**Step 2: Replace SAP parser body**

Use the shared parser with packet source IP fallback.

SAP behavior:
- Preserve fallback name `Unknown Stream`.
- Keep `sourceType: 'sap'`.
- Generate stable ID from origin, parsed IP, and parsed port. If origin is missing, use parsed name/IP/port as a fallback ID source.

**Step 3: Build**

Run: `npm run build`

Expected: Build succeeds.

### Task 4: Final Verification

**Files:**
- No new files unless validation scripts are added.

**Step 1: Run build**

Run: `npm run build`

Expected: Build succeeds.

**Step 2: Manual behavior checklist**

Check the sample partial SDP:

```text
o=- 3223857 3223857 IN IP4 192.168.1.151
s=111
c=IN IP4 239.81.83.67/32
m=audio 5004 RTP/AVP 97
a=rtpmap:97 L24/48000/8
```

Expected stream:
- Name: `111`
- IP: `239.81.83.67`
- Port: `5004`
- Channels: `8`
- Sample rate: `48000`
- Format: `L24`

Check three manual SDPs with the same IP and ports `5004`, `5005`, `5006`.

Expected: all three can exist in Available Streams as separate cards and can be dropped into different monitor slots.

**Step 3: Commit**

Run:

```bash
git add App.tsx electron/services/SapDiscovery.js utils/sdp.* docs/plans/2026-06-18-sdp-parser-implementation.md
git commit -m "fix: parse manual sdp streams consistently"
```
