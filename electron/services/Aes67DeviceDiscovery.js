import dgram from 'dgram';
import { EventEmitter } from 'events';

const DISCOVERY_GROUP = '239.0.0.188';
const DISCOVERY_PORT = 9996;
const OFFLINE_TIMEOUT_MS = 15000;
const PRUNE_INTERVAL_MS = 1000;

const toNumber = (value, fallback = 0) => {
  const parsed = parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseJsonFromBuffer = (msg) => {
  const text = msg.toString('utf8');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
};

class Aes67DeviceDiscovery extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.devices = new Map();
    this.activeInterface = null;
    this.pruneTimer = null;
  }

  setInterface(ip) {
    if (this.activeInterface === ip) return;

    if (this.socket && this.activeInterface) {
      try {
        this.socket.dropMembership(DISCOVERY_GROUP, this.activeInterface);
      } catch (error) {
        console.warn(`[AES67] drop membership failed: ${error.message}`);
      }
    }

    this.activeInterface = ip || null;

    if (this.socket && this.activeInterface) {
      try {
        this.socket.addMembership(DISCOVERY_GROUP, this.activeInterface);
        console.log(`[AES67] Listening on ${DISCOVERY_GROUP}:${DISCOVERY_PORT} via ${this.activeInterface}`);
      } catch (error) {
        console.error(`[AES67] add membership failed: ${error.message}`);
      }
    }
  }

  start() {
    if (this.socket) return;

    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    this.socket.on('error', (error) => {
      console.error(`[AES67] socket error: ${error.message}`);
    });

    this.socket.on('message', (msg, rinfo) => {
      this.handleMessage(msg, rinfo);
    });

    this.socket.bind(DISCOVERY_PORT, () => {
      if (this.activeInterface) {
        this.setInterface(this.activeInterface);
      } else {
        try {
          this.socket.addMembership(DISCOVERY_GROUP);
          console.log(`[AES67] Listening on ${DISCOVERY_GROUP}:${DISCOVERY_PORT} (default interface)`);
        } catch (error) {
          console.error(`[AES67] default membership failed: ${error.message}`);
        }
      }
    });

    this.pruneTimer = setInterval(() => this.pruneOffline(), PRUNE_INTERVAL_MS);
  }

  stop() {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }

    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }

    this.devices.clear();
    this.emitDevices();
  }

  handleMessage(msg, rinfo) {
    console.log(`[AES67] UDP packet from ${rinfo.address}:${rinfo.port}, bytes=${msg.length}`);
    const payload = parseJsonFromBuffer(msg);
    if (!payload || typeof payload !== 'object') {
      console.log(`[AES67] Parse failed. payloadPreview=${msg.toString('utf8').slice(0, 200)}`);
      return;
    }

    const normalizedKeyMap = Object.fromEntries(
      Object.entries(payload).map(([k, v]) => [String(k).replace(/\s+/g, '').toLowerCase(), v])
    );
    const rawOps = String(payload.ops ?? normalizedKeyMap.ops ?? '');
    const normalizedOps = rawOps.replace(/\s+/g, '').toLowerCase();
    if (normalizedOps !== 'iamdigisyn' && normalizedOps !== 'whoisdigisyn') {
      console.log(`[AES67] Ignore packet ops=${rawOps}`);
      return;
    }

    const devId = String(payload.devId ?? normalizedKeyMap.devid ?? payload.name ?? normalizedKeyMap.name ?? `${rinfo.address}`).trim();
    if (!devId) return;

    const next = {
      devId,
      name: String(payload.name ?? normalizedKeyMap.name ?? devId),
      model: String(payload.model ?? normalizedKeyMap.model ?? ''),
      ip: String(payload.ip ?? normalizedKeyMap.ip ?? rinfo.address),
      phyChNumTx: toNumber(payload.phyChNumTx ?? normalizedKeyMap.phychnumtx, 0),
      chNumTx: toNumber(payload.chNumTx ?? normalizedKeyMap.chnumtx, 0),
      lastSeenAt: Date.now(),
      offline: false
    };

    const prev = this.devices.get(devId);
    const changed =
      !prev ||
      prev.name !== next.name ||
      prev.model !== next.model ||
      prev.ip !== next.ip ||
      prev.phyChNumTx !== next.phyChNumTx ||
      prev.chNumTx !== next.chNumTx ||
      prev.offline;

    this.devices.set(devId, next);
    if (changed) {
      console.log(`[AES67] Device update: ${next.name} (${next.ip}) ops=${rawOps}`);
      this.emitDevices();
    }
  }

  pruneOffline() {
    const now = Date.now();
    let changed = false;

    for (const [devId, device] of this.devices.entries()) {
      const shouldOffline = now - device.lastSeenAt > OFFLINE_TIMEOUT_MS;
      if (device.offline !== shouldOffline) {
        this.devices.set(devId, {
          ...device,
          offline: shouldOffline
        });
        changed = true;
      }
    }

    if (changed) {
      this.emitDevices();
    }
  }

  emitDevices() {
    const devices = Array.from(this.devices.values()).sort((a, b) => a.name.localeCompare(b.name));
    this.emit('devices', devices);
  }
}

export default Aes67DeviceDiscovery;
