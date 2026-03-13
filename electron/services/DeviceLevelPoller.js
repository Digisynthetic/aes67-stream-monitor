import dgram from 'dgram';
import { EventEmitter } from 'events';

const POLL_INTERVAL_MS = 333;
const RESPONSE_TIMEOUT_MS = 300;
const OFFLINE_TIMEOUT_MS = 10000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseJson = (msg) => {
  try {
    return JSON.parse(msg.toString('utf8'));
  } catch {
    return null;
  }
};

class DeviceLevelPoller extends EventEmitter {
  constructor() {
    super();
    this.monitors = new Map();
  }

  start(stream) {
    if (!stream || stream.sourceType !== 'device' || !stream.deviceConfig) return;

    const group = {
      id: stream.id,
      deviceGroupConfig: {
        deviceIp: stream.ip,
        pollingPort: stream.deviceConfig.pollingPort || 8999,
        globalStart: stream.deviceConfig.idStart || 0,
        count: stream.channels || 8
      },
      channels: stream.channels || 8,
      name: stream.name,
      ip: stream.ip
    };

    this.startGroup(group);
  }

  startGroup(group) {
    if (!group || !group.id || !group.deviceGroupConfig) return;
    if (this.monitors.has(group.id)) return;

    const config = group.deviceGroupConfig;
    const targetIp = config.deviceIp || group.ip;
    const pollingPort = config.pollingPort || 8999;
    const globalStart = Number(config.globalStart ?? 0);
    const channelCount = Number(config.count ?? group.channels ?? 0);

    if (!targetIp || channelCount <= 0) return;

    const socket = dgram.createSocket('udp4');
    const pending = new Map();

    const monitor = {
      id: group.id,
      socket,
      pending,
      timer: null,
      timeoutTimer: null,
      pollingPort,
      targetIp,
      globalStart,
      channelCount,
      name: group.name,
      offline: false,
      lastResponseAt: Date.now(),
      inFlight: false
    };

    socket.on('error', (err) => {
      console.error(`[DevicePoller:${group.id}] Socket error: ${err.message}`);
    });

    socket.on('message', (msg) => {
      const data = parseJson(msg);
      if (!data) return;
      const cookie = String(data.cookie || '');
      if (!cookie) return;
      const resolver = pending.get(cookie);
      if (!resolver) return;
      pending.delete(cookie);
      resolver(data);
    });

    socket.bind(() => {
      const tick = async () => {
        if (monitor.inFlight) return;
        monitor.inFlight = true;

        try {
          const levels = await this.fetchLevels(monitor);
          if (levels.length > 0) {
            monitor.lastResponseAt = Date.now();
            if (monitor.offline) {
              monitor.offline = false;
              this.emit('error', {
                streamId: monitor.id,
                name: monitor.name,
                ip: monitor.targetIp,
                message: 'Device level polling resumed.',
                offline: false
              });
            }

            this.emit('levels', {
              streamId: monitor.id,
              arr: levels,
              channels: monitor.channelCount,
              name: monitor.name,
              ip: monitor.targetIp,
              offline: false
            });
          }
        } catch (error) {
          // keep loop alive
        } finally {
          monitor.inFlight = false;
        }
      };

      const timeoutCheck = () => {
        const offline = Date.now() - monitor.lastResponseAt > OFFLINE_TIMEOUT_MS;
        if (offline && !monitor.offline) {
          monitor.offline = true;
          this.emit('error', {
            streamId: monitor.id,
            name: monitor.name,
            ip: monitor.targetIp,
            message: 'No valid level JSON received within 10 seconds.',
            offline: true
          });
          this.emit('levels', {
            streamId: monitor.id,
            arr: [],
            channels: monitor.channelCount,
            name: monitor.name,
            ip: monitor.targetIp,
            offline: true
          });
        }
      };

      monitor.timer = setInterval(tick, POLL_INTERVAL_MS);
      monitor.timeoutTimer = setInterval(timeoutCheck, 1000);
      this.monitors.set(group.id, monitor);
      tick();
      console.log(`[DevicePoller:${group.id}] Started polling ${targetIp}:${pollingPort}`);
    });
  }

  async fetchLevels(monitor) {
    const needed = [];
    let currentStart = monitor.globalStart;
    let remaining = monitor.channelCount;
    const visitedStarts = new Set();

    while (remaining > 0 && !visitedStarts.has(currentStart)) {
      visitedStarts.add(currentStart);
      const response = await this.sendAndWait(monitor, currentStart);
      if (!response) break;

      const arr = Array.isArray(response.arr) ? response.arr : [];
      if (arr.length === 0) break;

      const take = Math.min(remaining, arr.length);
      needed.push(...arr.slice(0, take));
      remaining -= take;

      if (remaining <= 0) break;

      const next = Number(response.idNext);
      if (!Number.isFinite(next) || next === currentStart) break;
      currentStart = next;
    }

    return needed;
  }

  sendAndWait(monitor, idStart) {
    return new Promise((resolve) => {
      const cookie = `${Date.now()}-${Math.random()}`;
      const payload = Buffer.from(
        JSON.stringify({
          ops: 'getVolumeDbBatchOut',
          idStart: String(idStart),
          cookie
        })
      );

      const timeout = setTimeout(() => {
        monitor.pending.delete(cookie);
        resolve(null);
      }, RESPONSE_TIMEOUT_MS);

      monitor.pending.set(cookie, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });

      monitor.socket.send(payload, monitor.pollingPort, monitor.targetIp, (err) => {
        if (err) {
          clearTimeout(timeout);
          monitor.pending.delete(cookie);
          resolve(null);
        }
      });
    });
  }

  stop(streamId) {
    const monitor = this.monitors.get(streamId);
    if (!monitor) return;

    if (monitor.timer) clearInterval(monitor.timer);
    if (monitor.timeoutTimer) clearInterval(monitor.timeoutTimer);
    monitor.pending.clear();

    try {
      monitor.socket.close();
    } catch {
      // ignore
    }

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
