export type StreamSourceType = 'sap' | 'manual' | 'device' | 'device-group';

export interface Aes67Device {
  devId: string;
  name: string;
  model: string;
  ip: string;
  phyChNumTx: number;
  chNumTx: number;
  offline?: boolean;
  lastSeenAt?: number;
}

export type DeviceGroupKind = 'analog' | 'network';

export interface DeviceGroupConfig {
  deviceId: string;
  deviceIp: string;
  deviceName: string;
  deviceModel: string;
  kind: DeviceGroupKind;
  start: number;
  count: number;
  total: number;
  phyChNumTx: number;
  chNumTx: number;
  globalStart: number;
  pollingPort: number;
}

export interface Stream {
  id: string;
  name: string;
  ip: string;
  port: number;
  channels: number;
  sampleRate: number;
  format: string;
  sourceType: StreamSourceType;
  isOffline?: boolean;
  deviceConfig?: {
    idStart: number;
    pollingPort: number;
  };
  deviceGroupConfig?: DeviceGroupConfig;
}

export interface MonitorSlot {
  id: string;
  activeStreamId: string | null;
}

export interface ChannelLevel {
  current: number;
  peak: number;
  clipped?: boolean;
  offline?: boolean;
}

export interface StreamLevels {
  [streamId: string]: ChannelLevel[];
}

export interface NetworkInterface {
  name: string;
  address: string;
}

export const TOTAL_SLOTS = 8;
export const DB_MIN = -60;
export const DB_MAX = 0;
