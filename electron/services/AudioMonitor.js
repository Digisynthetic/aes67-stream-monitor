import dgram from 'dgram';
import { EventEmitter } from 'events';

// Constants for AES67 L24
const MAX_INT_24 = 8388607; // 2^23 - 1
const RTP_HEADER_SIZE = 12;

class AudioMonitor extends EventEmitter {
  constructor() {
    super();
    // Map of active monitors: streamId -> { socket, ip, port, channels, accumulators: [], sampleCounts: [] }
    this.monitors = new Map();
    this.activeInterface = null;
    
    // Run calculation loop every 250ms (4 times per second)
    this.interval = setInterval(() => this.calculateAndEmitLevels(), 250);
  }

  setInterface(ip) {
    console.log(`[AudioMonitor] Network interface updated to: ${ip}`);
    this.activeInterface = ip;
    // Restart all existing monitors to bind to new interface
    const currentMonitors = Array.from(this.monitors.entries());
    currentMonitors.forEach(([id, monitor]) => {
        this.stopMonitoring(id);
        this.startMonitoring(id, monitor.ip, monitor.port, monitor.channels);
    });
  }

  startMonitoring(id, ip, port, channels) {
    if (this.monitors.has(id)) {
        return; // Already monitoring
    }

    if (!this.activeInterface) {
        console.warn('[AudioMonitor] Cannot start monitoring: No active interface selected.');
        return;
    }

    try {
        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        
        const monitor = {
            id,
            ip,
            port,
            channels,
            socket,
            // Sum of squares for RMS calculation per channel
            accumulators: new Array(channels).fill(0),
            // Number of samples processed per channel
            sampleCount: 0 
        };

        socket.on('error', (err) => {
            console.error(`[AudioMonitor] Socket error for ${ip}:${port}:`, err.message);
            this.stopMonitoring(id);
        });

        socket.on('message', (msg) => {
            this.processRtpPacket(msg, monitor);
        });

        socket.bind(port, () => {
            try {
                socket.addMembership(ip, this.activeInterface);
                console.log(`[AudioMonitor] Started monitoring ${ip}:${port} (${channels}ch)`);
            } catch (e) {
                console.error(`[AudioMonitor] Failed to join multicast group ${ip}: ${e.message}`);
            }
        });

        this.monitors.set(id, monitor);

    } catch (e) {
        console.error(`[AudioMonitor] Failed to create socket: ${e.message}`);
    }
  }

  stopMonitoring(id) {
    const monitor = this.monitors.get(id);
    if (monitor) {
        try {
            // Drop membership to be polite to the switch
            if (this.activeInterface && monitor.socket) {
                 try {
                     monitor.socket.dropMembership(monitor.ip, this.activeInterface);
                 } catch (e) { /* ignore */ }
            }
            monitor.socket.close();
        } catch (e) {
            console.error(`[AudioMonitor] Error closing socket: ${e.message}`);
        }
        this.monitors.delete(id);
        console.log(`[AudioMonitor] Stopped monitoring ${id}`);
    }
  }

  processRtpPacket(buffer, monitor) {
    // Basic RTP validation
    if (buffer.length <= RTP_HEADER_SIZE) return;

    // We assume L24 (24-bit PCM), Big Endian, Interleaved
    // Payload starts after RTP header
    let offset = RTP_HEADER_SIZE;
    
    // Check for Extension bit in standard RTP header (Byte 0, bit 4)
    // If set, we theoretically should skip extension header, but for basic AES67 
    // without header extensions, we assume fixed 12 bytes for performance.
    
    const end = buffer.length;
    let channelIdx = 0;
    
    // Iterate through samples
    // Each sample is 3 bytes (24 bits)
    while (offset + 3 <= end) {
        // Read 3 bytes big-endian
        const b0 = buffer[offset];
        const b1 = buffer[offset + 1];
        const b2 = buffer[offset + 2];
        
        // Combine to 24-bit integer
        let sample = (b0 << 16) | (b1 << 8) | b2;
        
        // Sign extension for 24-bit to 32-bit JS integer
        // If the 24th bit (0x800000) is set, it's negative
        if (sample & 0x800000) {
            sample = sample | 0xFF000000;
        }

        // Add square to accumulator (Power calculation)
        // Storing as sum of squares to calc RMS later
        if (channelIdx < monitor.channels) {
            monitor.accumulators[channelIdx] += (sample * sample);
        }

        // Advance
        offset += 3;
        channelIdx++;
        
        // Wrap around channels (Interleaved L, R, L, R...)
        if (channelIdx >= monitor.channels) {
            channelIdx = 0;
            // Increment sample count only after a full frame of channels
            monitor.sampleCount++;
        }
    }
  }

  calculateAndEmitLevels() {
    const results = {};

    for (const [id, monitor] of this.monitors) {
        const levels = [];
        
        // If no samples received, return -100 dB (Silence)
        if (monitor.sampleCount === 0) {
             for(let i=0; i<monitor.channels; i++) levels.push(-100);
        } else {
            for (let i = 0; i < monitor.channels; i++) {
                const sumSquares = monitor.accumulators[i];
                // RMS = Sqrt(Sum / Count)
                const rms = Math.sqrt(sumSquares / monitor.sampleCount);
                
                // dBFS = 20 * log10(RMS / MaxValue)
                let db = 20 * Math.log10(rms / MAX_INT_24);
                
                if (!isFinite(db)) db = -100; // Handle log(0)
                if (db < -100) db = -100;
                
                levels.push(db);

                // Reset accumulator
                monitor.accumulators[i] = 0;
            }
            // Reset count
            monitor.sampleCount = 0;
        }
        results[id] = levels;
    }

    if (Object.keys(results).length > 0) {
        this.emit('levels', results);
    }
  }

  stopAll() {
      for (const id of this.monitors.keys()) {
          this.stopMonitoring(id);
      }
      clearInterval(this.interval);
  }
}

export default AudioMonitor;