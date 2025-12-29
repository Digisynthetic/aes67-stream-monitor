import dgram from 'dgram';
import { EventEmitter } from 'events';

const POLL_INTERVAL_MS = 250;
const COMMAND_TEMPLATE = (idStart = 0) => JSON.stringify({
  ops: 'getVolumeDbBatchIn',
  idStart: `${idStart}`
});

class DeviceLevelPoller extends EventEmitter {
  constructor() {
    super();
    this.monitors = new Map();
  }

  start(stream) {
    if (!stream || stream.sourceType !== 'device' || !stream.deviceConfig) return;

    const existing = this.monitors.get(stream.id);
    if (existing) return;

    const pollingPort = stream.deviceConfig.pollingPort || 8999;
    const payloadBuffer = Buffer.from(COMMAND_TEMPLATE(stream.deviceConfig.idStart));
    const socket = dgram.createSocket('udp4');
    const sendCommand = () => {
      socket.send(payloadBuffer, pollingPort, stream.ip, (err) => {
        if (err) {
          console.error(`[DevicePoller:${stream.id}] Failed to send command:`, err.message);
        }
      });
    };

    socket.on('message', (msg) => {
      try {
        const response = JSON.parse(msg.toString('utf8'));
        const arr = Array.isArray(response.arr) ? response.arr : [];
        //console.log(`[DevicePoller:${stream.id}] arr: ${arr.join(',')}`);
        this.emit('levels', {
          streamId: stream.id,
          arr,
          channels: stream.channels,
          name: stream.name,
          ip: stream.ip
        });

        if (!arr.length) {
          this.emit('error', {
            streamId: stream.id,
            name: stream.name,
            ip: stream.ip,
            message: 'Device did not return channel levels.'
          });
        }
      } catch (error) {
        console.error(`[DevicePoller:${stream.id}] Failed to parse response:`, error);
      }
    });

    socket.on('error', (err) => {
      console.error(`[DevicePoller:${stream.id}] Socket error:`, err.message);
    });

    socket.bind(() => {
      sendCommand();
      const timer = setInterval(sendCommand, POLL_INTERVAL_MS);
      this.monitors.set(stream.id, { socket, timer });
      console.log(`[DevicePoller:${stream.id}] Started polling ${stream.ip}:${pollingPort}`);
    });
  }

  stop(streamId) {
    const monitor = this.monitors.get(streamId);
    if (!monitor) return;
    clearInterval(monitor.timer);
    monitor.socket.close();
    this.monitors.delete(streamId);
    console.log(`[DevicePoller:${streamId}] Stopped polling`);
  }

  stopAll() {
    for (const streamId of Array.from(this.monitors.keys())) {
      this.stop(streamId);
    }
  }
}

export default DeviceLevelPoller;
