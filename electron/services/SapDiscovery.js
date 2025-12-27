const dgram = require('dgram');
const os = require('os');
const { EventEmitter } = require('events');

class SapDiscovery extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.streams = new Map(); // Key: ID, Value: { streamData, lastSeen }
    this.multicastGroup = '239.255.255.255';
    this.port = 9875;
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
      // Bind to all suitable IPv4 interfaces to ensure we catch multicast
      const interfaces = this.getAllIPv4Interfaces();
      if (interfaces.length > 0) {
        interfaces.forEach(iface => {
            console.log(`[SAP] Adding membership for ${this.multicastGroup} on interface: ${iface}`);
            try {
                this.socket.addMembership(this.multicastGroup, iface);
            } catch (e) {
                console.error(`[SAP] Failed to add membership on ${iface}:`, e.message);
            }
        });
      } else {
        console.warn('[SAP] No suitable IPv4 interface found. Discovery might fail.');
      }
    });

    // Prune streams every 5 seconds (timeout 120s)
    setInterval(() => this.pruneStreams(), 5000);
  }

  getAllIPv4Interfaces() {
    const ips = [];
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Skip internal (localhost) and non-IPv4
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    return ips;
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
    const lines = text.split('\n').map(l => l.trim());
    
    let name = 'Unknown Stream';
    let ip = '';
    let id = '';
    let channels = 2;
    let sampleRate = 48000;
    
    lines.forEach(line => {
      if (line.startsWith('s=')) name = line.substring(2);
      if (line.startsWith('c=')) {
        // c=IN IP4 239.0.0.1/32
        const parts = line.split(' ');
        if (parts.length >= 3) ip = parts[2].split('/')[0];
      }
      if (line.startsWith('o=')) {
        // o=- 12345 12345 IN IP4 10.0.0.1
        // Use Origin line for unique ID
        id = line; 
      }
      if (line.startsWith('a=rtpmap:')) {
        // a=rtpmap:96 L24/48000/2
        const parts = line.split('/');
        if (parts.length >= 2) sampleRate = parseInt(parts[1]);
        if (parts.length >= 3) channels = parseInt(parts[2]);
      }
    });

    if (!id) return null;

    return {
      id: Buffer.from(id).toString('base64'), // Create safe ID
      name,
      ip: ip || sourceIp, // Fallback to packet source if multicast IP not found
      channels,
      sampleRate,
      format: 'L24', // Default for AES67
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

module.exports = SapDiscovery;