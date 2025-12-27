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
      const iface = this.getIPv4Interface();
      if (iface) {
        console.log(`[SAP] Binding to interface: ${iface}`);
        try {
          this.socket.addMembership(this.multicastGroup, iface);
          this.socket.setMulticastInterface(iface);
        } catch (e) {
          console.error('[SAP] Failed to add membership:', e);
        }
      } else {
        console.warn('[SAP] No suitable IPv4 interface found. Discovery might fail.');
      }
    });

    // Prune streams every 5 seconds (timeout 60s)
    setInterval(() => this.pruneStreams(), 5000);
  }

  getIPv4Interface() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Skip internal (localhost) and non-IPv4
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return null;
  }

  handleMessage(msg, rinfo) {
    const text = msg.toString('utf8');
    
    // Basic SDP Validation (SAP header is usually skipped or handled, 
    // but often SDP starts directly after header in simple implementations 
    // or we just regex the body)
    
    // Check for v=0 (SDP Version)
    if (!text.includes('v=0')) return;

    try {
      const stream = this.parseSdp(text, rinfo.address);
      if (stream) {
        const existing = this.streams.get(stream.id);
        
        this.streams.set(stream.id, {
          streamData: stream,
          lastSeen: Date.now()
        });

        // If it's a new stream or significant change, emit update
        if (!existing) {
          this.emitStreams();
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
    
    for (const [id, data] of this.streams) {
      if (now - data.lastSeen > 60000) { // 60s timeout
        this.streams.delete(id);
        changed = true;
      }
    }

    if (changed) {
      this.emitStreams();
    }
  }

  emitStreams() {
    const list = Array.from(this.streams.values()).map(d => d.streamData);
    this.emit('update', list);
  }
}

module.exports = SapDiscovery;