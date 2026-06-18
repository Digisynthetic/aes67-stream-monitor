import dgram from 'dgram';
import os from 'os';
import { EventEmitter } from 'events';
import { parseSdp } from '../../utils/sdp.js';

class SapDiscovery extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.streams = new Map(); // Key: ID, Value: { streamData, lastSeen }
    this.multicastGroup = '239.255.255.255';
    this.port = 9875;
    this.activeInterface = null;
  }

  getInterfaces() {
    const interfaces = os.networkInterfaces();
    const result = [];
    const seen = new Set();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (!iface) continue;
        const isIpv4 = iface.family === 'IPv4' || iface.family === 4;
        // Skip internal (localhost) and non-IPv4
        if (isIpv4 && !iface.internal && iface.address && !seen.has(iface.address)) {
          seen.add(iface.address);
          result.push({ name, address: iface.address });
        }
      }
    }
    return result;
  }

  setInterface(ip) {
    if (this.activeInterface === ip) return;

    // Drop membership from old interface if socket is active
    if (this.socket && this.activeInterface) {
        try {
            this.socket.dropMembership(this.multicastGroup, this.activeInterface);
            console.log(`[SAP] Dropped membership for ${this.activeInterface}`);
        } catch (e) {
            console.warn(`[SAP] Failed to drop membership: ${e.message}`);
        }
    }

    this.activeInterface = ip;
    
    // Clear streams when switching networks
    this.streams.clear();
    this.emitStreams([]);

    // Add membership to new interface
    if (this.socket && this.activeInterface) {
        try {
            console.log(`[SAP] Binding to interface: ${this.activeInterface}`);
            this.socket.addMembership(this.multicastGroup, this.activeInterface);
        } catch (e) {
            console.error(`[SAP] Failed to add membership for ${this.activeInterface}:`, e.message);
        }
    }
    this.emit('interface-changed', this.activeInterface);
  }

  start() {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    this.socket.on('error', (err) => {
      console.error(`SAP Socket error:\n${err.stack}`);
      this.socket.close();
    });

    this.socket.on('message', (msg, rinfo) => {
      this.handleMessage(msg, rinfo);
    });

    this.socket.bind(this.port, () => {
      // Initialize with the first available interface or the active one
      const ifaces = this.getInterfaces();
      if (ifaces.length > 0) {
        if (!this.activeInterface) {
            // Default to first interface
            this.setInterface(ifaces[0].address);
        } else {
            // Re-bind existing choice (e.g. if socket restarted)
            try {
                this.socket.addMembership(this.multicastGroup, this.activeInterface);
            } catch (e) {
                console.error(`[SAP] Failed to restore membership: ${e.message}`);
            }
        }
      } else {
        console.warn('[SAP] No suitable IPv4 interface found. Discovery might fail.');
      }
    });

    // Prune streams every 5 seconds (timeout 120s)
    setInterval(() => this.pruneStreams(), 5000);
  }

  handleMessage(msg, rinfo) {
    // Robust parsing: Find start of SDP payload via "v=0"
    const msgString = msg.toString('utf8');
    const sdpIndex = msgString.indexOf('v=0');

    if (sdpIndex === -1) return; // Not a valid SDP packet or header only

    const sdpText = msgString.substring(sdpIndex);

    try {
      const stream = this.parseSdp(sdpText, rinfo.address);
      if (stream) {
        const existing = this.streams.get(stream.id);
        
        this.streams.set(stream.id, {
          streamData: stream,
          lastSeen: Date.now()
        });

        // If it's a new stream, emit update immediately
        if (!existing) {
          this.emitStreams([]);
        }
      }
    } catch (e) {
      // Ignore malformed packets
    }
  }

  parseSdp(text, sourceIp) {
    const parsed = parseSdp(text, sourceIp);

    if (!parsed.isMonitorable || !parsed.ip || !parsed.port) return null;

    const idSource = [
      parsed.origin || parsed.name || 'unknown-origin',
      parsed.ip,
      parsed.port
    ].join('|');

    return {
      id: Buffer.from(idSource).toString('base64'), // Create safe ID
      name: parsed.name || 'Unknown Stream',
      ip: parsed.ip,
      port: parsed.port,
      channels: parsed.channels,
      sampleRate: parsed.sampleRate,
      format: parsed.format,
      sourceType: 'sap'
    };
  }

  pruneStreams() {
    const now = Date.now();
    let changed = false;
    const removedNames = [];
    
    // Timeout set to 120 seconds (2 minutes)
    const TIMEOUT_MS = 120000;

    for (const [id, data] of this.streams) {
      if (now - data.lastSeen > TIMEOUT_MS) {
        this.streams.delete(id);
        removedNames.push(data.streamData.name);
        changed = true;
      }
    }

    if (changed) {
      this.emitStreams(removedNames);
    }
  }

  emitStreams(removedNames = []) {
    const list = Array.from(this.streams.values()).map(d => d.streamData);
    this.emit('update', { streams: list, removed: removedNames });
  }
}

export default SapDiscovery;
