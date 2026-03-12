# AES67 Device Monitor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace manual UDP device-level input with auto-discovered AES67 devices and drag-to-monitor output channel groups (analog/network), including paging level polling, clip coloring, and offline graying.

**Architecture:** Add a dedicated Electron discovery service for `239.0.0.188:9996`, expand the existing device poller to support per-group `getVolumeDbBatchOut` paging on `ip:8999`, and refactor renderer state from manual device streams to discovered device/group cards. Preserve current 8-slot wall and existing smooth meter behavior while adding clip/offline visual rules.

**Tech Stack:** Electron (IPC + UDP), React + TypeScript, existing DnD-kit UI, Vite build.

---

### Task 1: Add Small Pure Helper Layer + Test Harness (TDD Foundation)

**Files:**
- Create: `utils/deviceGroups.ts`
- Create: `utils/deviceGroups.test.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { splitDeviceGroups, mapCombinedOutIndex } from './deviceGroups';

describe('splitDeviceGroups', () => {
  it('splits 16 analog + 16 network into 4 cards of 8', () => {
    const groups = splitDeviceGroups({ devId: 'd1', ip: '192.168.1.2', name: 'A', model: 'dmx', phyChNumTx: 16, chNumTx: 16 });
    expect(groups).toHaveLength(4);
    expect(groups.filter(g => g.kind === 'analog')).toHaveLength(2);
    expect(groups.filter(g => g.kind === 'network')).toHaveLength(2);
  });
});

describe('mapCombinedOutIndex', () => {
  it('maps network index after analog range', () => {
    expect(mapCombinedOutIndex({ kind: 'network', start: 0, phyChNumTx: 4 })).toBe(4);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run utils/deviceGroups.test.ts`
Expected: FAIL with missing module/functions.

**Step 3: Write minimal implementation**

```ts
export function splitDeviceGroups(device) { return []; }
export function mapCombinedOutIndex(input) { return 0; }
```

**Step 4: Run test to verify it passes (after full implementation in Task 2)**

Run: `npx vitest run utils/deviceGroups.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add package.json utils/deviceGroups.ts utils/deviceGroups.test.ts
git commit -m "test: add device group helper tests"
```

### Task 2: Implement Device Group Split + Combined Index Mapping

**Files:**
- Modify: `utils/deviceGroups.ts`
- Modify: `types.ts`
- Test: `utils/deviceGroups.test.ts`

**Step 1: Write/extend failing test**

```ts
it('splits 4+4 into one analog and one network card', () => {
  const groups = splitDeviceGroups({ devId:'d2', ip:'1.1.1.1', name:'B', model:'m', phyChNumTx:4, chNumTx:4 });
  expect(groups.map(g => [g.kind, g.count])).toEqual([['analog',4], ['network',4]]);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run utils/deviceGroups.test.ts`
Expected: FAIL for wrong values.

**Step 3: Write minimal implementation**

```ts
export function splitDeviceGroups(device) {
  // Create analog cards first, then network cards, each max 8 channels.
}

export function mapCombinedOutIndex({ kind, start, phyChNumTx }) {
  return kind === 'analog' ? start : phyChNumTx + start;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run utils/deviceGroups.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add utils/deviceGroups.ts utils/deviceGroups.test.ts types.ts
git commit -m "feat: add AES67 device group split helpers"
```

### Task 3: Add AES67 Discovery Service (Passive Listen on 239.0.0.188:9996)

**Files:**
- Create: `electron/services/Aes67DeviceDiscovery.js`
- Modify: `electron/main.js`

**Step 1: Write failing behavior check (manual smoke)**

```txt
Expected behavior before implementation:
- renderer receives no `aes67-devices` event
- no device list in left panel
```

**Step 2: Run check to verify it fails**

Run: `npm run dev:app`
Expected: No AES67 device events/logs.

**Step 3: Write minimal implementation**

```js
// Aes67DeviceDiscovery.js
// Listen multicast 239.0.0.188:9996, parse whoIsDigisyn/iAmDigisyn, keep lastSeen, emit full list.
```

```js
// main.js wiring
// initialize discovery service, forward events: mainWindow.webContents.send('aes67-devices', payload)
```

**Step 4: Run verification**

Run: `npm run dev:app`
Expected: Logs show join/listen and incoming devices are emitted.

**Step 5: Commit**

```bash
git add electron/services/Aes67DeviceDiscovery.js electron/main.js
git commit -m "feat: add AES67 multicast device discovery service"
```

### Task 4: Extend Preload IPC Surface for AES67 Devices + Group Polling

**Files:**
- Modify: `electron/preload.js`
- Modify: `electron/main.js`

**Step 1: Write failing usage check**

```ts
// Renderer call sites should fail initially:
window.api.onAes67Devices(...)
window.api.startDeviceGroupMonitoring(...)
window.api.stopDeviceGroupMonitoring(...)
```

**Step 2: Run check to verify it fails**

Run: `npm run build`
Expected: TS/runtime reference errors before API is exposed.

**Step 3: Write minimal implementation**

```js
// preload.js expose:
onAes67Devices(cb)
startDeviceGroupMonitoring(group)
stopDeviceGroupMonitoring(groupId)
```

```js
// main.js IPC handlers:
start-device-group-monitoring / stop-device-group-monitoring
```

**Step 4: Run verification**

Run: `npm run build`
Expected: build succeeds for IPC references.

**Step 5: Commit**

```bash
git add electron/preload.js electron/main.js
git commit -m "feat: expose AES67 discovery and group monitor IPC"
```

### Task 5: Upgrade Device Poller to `getVolumeDbBatchOut` + Paging + 3Hz + 10s Timeout

**Files:**
- Modify: `electron/services/DeviceLevelPoller.js`
- Modify: `types.ts`

**Step 1: Write failing test-like assertions (target behavior comments + log guard)**

```txt
For a network group with start beyond first page:
- poller must request with idStart = globalStart
- follow idNext until count channels covered
```

**Step 2: Run check to verify it fails in current code**

Run: `npm run dev:app`
Expected: current poller uses getVolumeDbBatchIn at 250ms and cannot page by group.

**Step 3: Write minimal implementation**

```js
// Poll interval -> 333ms
// Command -> getVolumeDbBatchOut
// Per monitor group maintain lastResponseAt
// If now-lastResponseAt > 10000 emit timeout/offline payload
// Implement paging via idStart/idNext and slice required combined output range
```

**Step 4: Run verification**

Run: `npm run dev:app`
Expected: grouped payloads emitted, timeout events emitted after 10s silence.

**Step 5: Commit**

```bash
git add electron/services/DeviceLevelPoller.js types.ts
git commit -m "feat: implement grouped output level polling with paging and timeout"
```

### Task 6: Refactor Renderer Left Panel to Online AES67 Device + Secondary Group Cards

**Files:**
- Modify: `App.tsx`
- Modify: `components/StreamCard.tsx`
- Modify: `types.ts`
- Modify: `README.md`

**Step 1: Write failing behavior check**

```txt
Current UI still shows manual device form; expected new device list with expandable group cards.
```

**Step 2: Run check to verify it fails**

Run: `npm run dev:app`
Expected: manual IP form still present.

**Step 3: Write minimal implementation**

```tsx
// Replace manual device add UI block with AES67 discovered devices list.
// Render expandable parent device cards + draggable child group cards.
// Child card color: analog red, network green. Gray when offline.
```

**Step 4: Run verification**

Run: `npm run dev:app`
Expected: devices auto-appear, expand/collapse works, child cards draggable.

**Step 5: Commit**

```bash
git add App.tsx components/StreamCard.tsx types.ts README.md
git commit -m "feat: replace manual device entry with discovered AES67 group cards"
```

### Task 7: Wire Drag/Drop Slot Lifecycle to Start/Stop Group Polling

**Files:**
- Modify: `App.tsx`
- Modify: `components/MonitorSlot.tsx`

**Step 1: Write failing behavior check**

```txt
Before change: dropping new group card does not start grouped polling lifecycle.
```

**Step 2: Run check to verify it fails**

Run: `npm run dev:app`
Expected: no start/stop IPC for group cards.

**Step 3: Write minimal implementation**

```tsx
// On slot assign -> startDeviceGroupMonitoring(group)
// On clear/replace -> stopDeviceGroupMonitoring(previousGroupId)
// Maintain activeGroupRef set for dedup and cleanup.
```

**Step 4: Run verification**

Run: `npm run dev:app`
Expected: start on drop, stop on remove/replace, no duplicate polling.

**Step 5: Commit**

```bash
git add App.tsx components/MonitorSlot.tsx
git commit -m "feat: start and stop group polling from slot lifecycle"
```

### Task 8: Apply Meter Visual Rules (Smoothing Reuse + Clip >= -2dBFS + Offline Gray)

**Files:**
- Modify: `components/LevelMeter.tsx`
- Modify: `utils/audio.ts`
- Modify: `App.tsx`
- Modify: `types.ts`

**Step 1: Write failing test/check**

```txt
Current meter does not force red at >= -2 dBFS and lacks offline gray state.
```

**Step 2: Run check to verify it fails**

Run: `npm run dev:app`
Expected: channels near -1 dBFS still use normal gradient; offline groups not gray.

**Step 3: Write minimal implementation**

```ts
// Add clip detection: value >= -2
// If clip -> full red bar
// If offline -> gray color palette + muted peak
// Preserve existing current/peak smoothing pipeline
```

**Step 4: Run verification**

Run: `npm run dev:app`
Expected: clip channels turn red, offline sources turn gray, smoothing unchanged.

**Step 5: Commit**

```bash
git add components/LevelMeter.tsx utils/audio.ts App.tsx types.ts
git commit -m "feat: add clip and offline meter coloring rules"
```

### Task 9: Discovery Offline (15s) + End-to-End Verification + Documentation

**Files:**
- Modify: `electron/services/Aes67DeviceDiscovery.js`
- Modify: `App.tsx`
- Modify: `README.md`

**Step 1: Write failing behavior check**

```txt
Before completion: left/right cards do not consistently gray after 15s without discovery.
```

**Step 2: Run check to verify it fails**

Run: `npm run dev:app`
Expected: stale device remains online.

**Step 3: Write minimal implementation**

```js
// Discovery service periodic prune: offline when now-lastSeenAt > 15000, emit status updates.
```

```tsx
// Renderer maps offline status to left group cards and right slot display state.
```

**Step 4: Run verification suite**

Run: `npx vitest run utils/deviceGroups.test.ts`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

Run: `npm run dev:app`
Expected: all acceptance criteria validated manually (discovery, split, drag lifecycle, paging levels, clip red, 10s/15s gray).

**Step 5: Commit**

```bash
git add electron/services/Aes67DeviceDiscovery.js App.tsx README.md
git commit -m "feat: finalize offline handling and verification for AES67 device monitor"
```

## Notes

- Keep unrelated SAP monitoring behavior untouched.
- Do not remove user-existing workspace edits unrelated to this feature.
- Preserve right panel layout and slot count (`8`).
- Prefer incremental commits exactly as listed.
