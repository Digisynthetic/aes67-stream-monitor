import { DB_MIN, DB_MAX } from '../types';

/**
 * Maps a dBFS value to a percentage height (0-100)
 */
export const dbToPercent = (db: number): number => {
  if (db <= DB_MIN) return 0;
  if (db >= DB_MAX) return 100;
  
  // Linear scaling for display
  const range = DB_MAX - DB_MIN;
  const value = db - DB_MIN;
  return (value / range) * 100;
};

/**
 * Determines the color of the meter based on dB value
 * Green: -Inf to -18 dBFS (Normal)
 * Yellow/Orange: -18 to 0 dBFS (Headroom/Warning)
 * Red: ~0 dBFS (Clipping)
 */
export const getMeterColor = (db: number): string => {
  // Trigger red when extremely close to 0 or at 0
  if (db >= -0.2) return '#ef4444'; // Red-500 (Clip)
  if (db >= -18) return '#f59e0b'; // Amber-500 (Warning/Headroom)
  return '#22c55e'; // Green-500 (Normal)
};

/**
 * Mock generator for random stream data
 */
export const generateMockStreams = (count: number): any[] => {
  const streams = [];
  for (let i = 1; i <= count; i++) {
    streams.push({
      id: `stream-${i}`,
      name: `Studio ${Math.ceil(i/2)} - ${i % 2 === 0 ? 'PGM' : 'BGM'}`,
      ip: `239.0.0.${100 + i}`,
      channels: 8,
      sampleRate: 48000,
      format: 'L24',
    });
  }
  return streams;
};