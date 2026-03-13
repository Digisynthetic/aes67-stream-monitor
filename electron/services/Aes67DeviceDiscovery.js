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
    this.joinedInterface = null;
    this.isBound = false;
  }

  setInterface(ip) {
    this.activeInterface = ip || null;
    this.joinMembership();
  }

  joinMembership() {
    if (!this.socket || !this.activeInterface || !this.isBound) return;

    if (this.joinedInterface && this.joinedInterface !== this.activeInterface) {
      try {
        this.socket.dropMembership(DISCOVERY_GROUP, this.joinedInterface);
      } catch {
        // ignore
      }
      this.joinedInterface = null;
    }

    if (this.joinedInterface === this.activeInterface) return;

    try {
      this.socket.addMembership(DISCOVERY_GROUP, this.activeInterface);
      this.joinedInterface = this.activeInterface;
      console.log(`[AES67] JOIN OK ${DISCOVERY_GROUP} via ${this.activeInterface}`);
    } catch (error) {
      console.error(`[AES67] JOIN ERR via ${this.activeInterface}: ${error.message}`);
    }
  }

  start() {
    if (this.socket) return;

    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.isBound = false;

    this.socket.on('error', (error) => {
      console.error(`[AES67] socket error: ${error.message}`);
    });

    this.socket.on('message', (msg, rinfo) => {
      this.handleMessage(msg, rinfo);
    });

    this.socket.bind({ port: DISCOVERY_PORT, address: '0.0.0.0', exclusive: false }, () => {
      const addr = this.socket.address();
      this.isBound = true;
      console.log(`[AES67] BOUND ${addr.address}:${addr.port}`);
      this.joinMembership();
    });

    this.pruneTimer = setInterval(() => this.pruneOffline(), PRUNE_INTERVAL_MS);
  }

  stop() {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }

    if (this.socket) {
      if (this.joinedInterface) {
        try {
          this.socket.dropMembership(DISCOVERY_GROUP, this.joinedInterface);
        } catch {
          // ignore
        }
      }
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
      this.joinedInterface = null;
      this.isBound = false;
    }

    this.devices.clear();
    this.emitDevices();
  }

  handleMessage(msg, rinfo) {
    console.log(`[AES67] PKT ${rinfo.address}:${rinfo.port} len=${msg.length}`);
    const payload = parseJsonFromBuffer(msg);
    if (!payload || typeof payload !== 'object') return;

    const rawOps = String(payload.ops || '');
    const normalizedOps = rawOps.replace(/\s+/g, '').toLowerCase();
    // Only device advertisement packets are valid device sources.
    if (normalizedOps !== 'iamdigisyn') return;

    const devId = String(payload.devId || payload.name || `${rinfo.address}`).trim();
    if (!devId) return;

    const model = String(payload.model || '').trim();
    if (model.toLowerCase() === 'vsndcard') {
      return;
    }

    const next = {
      devId,
      name: String(payload.name || devId),
      model,
      ip: String(payload.ip || rinfo.address),
      phyChNumTx: toNumber(payload.phyChNumTx, 0),
      chNumTx: toNumber(payload.chNumTx, 0),
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
      console.log(`[AES67] Device update: ${next.name} (${next.ip})`);
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

    if (changed) this.emitDevices();
  }

  emitDevices() {
    const devices = Array.from(this.devices.values()).sort((a, b) => a.name.localeCompare(b.name));
    this.emit('devices', devices);
  }
}

export default Aes67DeviceDiscovery;
