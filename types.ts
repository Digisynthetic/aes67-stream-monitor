export interface Stream {
  id: string;
  name: string;
  ip: string;
  channels: number;
  sampleRate: number;
  format: string; // e.g., "L24" or "JSON"
  sourceType: 'sap' | 'manual' | 'device';
  deviceConfig?: {
    idStart: number;
    pollingPort: number;
  };
}

export interface MonitorSlot {
  id: string;
  activeStreamId: string | null;
}

export interface ChannelLevel {
  current: number; // dBFS
  peak: number;    // dBFS (Peak hold)
}

export interface StreamLevels {
  [streamId: string]: ChannelLevel[];
}

// Constants
export const TOTAL_SLOTS = 8;
export const DB_MIN = -60;
export const DB_MAX = 0;