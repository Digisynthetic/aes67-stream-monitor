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

const DEFAULT_FORMAT = 'L24';
const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_CHANNELS = 2;

export function createManualStreamId(ip: string, port: number, uniquePart: number | string = Date.now()): string {
  const safeIp = ip.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `manual-${safeIp}-${port}-${uniquePart}`;
}

export function parseSdp(text: string, fallbackIp?: string): ParsedSdp {
  const result: ParsedSdp = {
    channels: DEFAULT_CHANNELS,
    sampleRate: DEFAULT_SAMPLE_RATE,
    format: DEFAULT_FORMAT,
    isMonitorable: false,
  };

  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('s=')) {
      const name = trimmed.slice(2).trim();
      if (name) {
        result.name = name;
      }
      continue;
    }

    if (trimmed.startsWith('o=')) {
      const origin = trimmed.slice(2).trim();
      if (origin) {
        result.origin = origin;
      }
      continue;
    }

    if (trimmed.startsWith('c=')) {
      const connectionParts = trimmed.slice(2).trim().split(/\s+/);
      const address = connectionParts.at(-1)?.split('/')[0]?.trim();
      if (address) {
        result.ip = address;
      }
      continue;
    }

    if (trimmed.startsWith('m=')) {
      const mediaParts = trimmed.slice(2).trim().split(/\s+/);
      if (mediaParts[0] === 'audio') {
        const port = Number(mediaParts[1]);
        if (Number.isInteger(port) && port > 0) {
          result.port = port;
        }
      }
      continue;
    }

    if (trimmed.startsWith('a=rtpmap:')) {
      const spaceIndex = trimmed.indexOf(' ');
      if (spaceIndex === -1) {
        continue;
      }

      const encoding = trimmed.slice(spaceIndex + 1).trim();
      const [format, sampleRate, channels] = encoding.split('/');

      if (format) {
        result.format = format;
      }

      const parsedSampleRate = Number(sampleRate);
      if (Number.isInteger(parsedSampleRate) && parsedSampleRate > 0) {
        result.sampleRate = parsedSampleRate;
      }

      const parsedChannels = Number(channels);
      if (Number.isInteger(parsedChannels) && parsedChannels > 0) {
        result.channels = parsedChannels;
      }
    }
  }

  result.ip ??= fallbackIp;
  result.isMonitorable = Boolean(result.ip && result.port && result.port > 0);

  return result;
}
