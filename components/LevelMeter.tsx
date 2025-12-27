import React, { useMemo } from 'react';
import { dbToPercent, getMeterColor } from '../utils/audio';
import { ChannelLevel, DB_MIN } from '../types';

interface LevelMeterProps {
  level: ChannelLevel;
  index: number;
  channelName?: string;
}

const LevelMeter: React.FC<LevelMeterProps> = ({ level, index, channelName }) => {
  const { current, peak } = level;

  // Calculate heights
  const heightPercent = dbToPercent(current);
  const peakPercent = dbToPercent(peak);
  const color = getMeterColor(current);

  return (
    <div className="flex flex-col items-center gap-1 w-full h-full">
      {/* Meter Container */}
      <div className="relative w-full flex-grow bg-slate-950/80 border border-slate-800 rounded-sm overflow-hidden">
        
        {/* Grid Lines (Background) */}
        <div className="absolute inset-0 flex flex-col justify-between py-1 pointer-events-none opacity-20">
          <div className="w-full h-px bg-slate-400 top-[0%]" />  {/* 0dB */}
          <div className="w-full h-px bg-slate-400 top-[10%]" /> {/* -6dB approx */}
          <div className="w-full h-px bg-slate-400 top-[30%]" /> {/* -18dB approx */}
          <div className="w-full h-px bg-slate-400 top-[100%]" /> {/* -60dB */}
        </div>

        {/* The Signal Bar */}
        <div
          className="meter-bar absolute bottom-0 w-full transition-all duration-75 ease-out"
          style={{
            height: `${heightPercent}%`,
            backgroundColor: color,
            boxShadow: `0 0 12px ${color}40` // Subtle glow matching the vibrant colors
          }}
        />

        {/* Peak Hold Indicator */}
        <div
          className="absolute w-full h-0.5 bg-white transition-all duration-300 ease-out z-10"
          style={{
            bottom: `${peakPercent}%`,
            opacity: peak <= DB_MIN ? 0 : 0.9,
            boxShadow: '0 0 4px rgba(255,255,255,0.5)'
          }}
        />
      </div>

      {/* Channel Label */}
      <div className="text-[10px] text-slate-500 font-mono">
        {channelName || (index + 1)}
      </div>
      
      {/* dB Value (Optional, hidden on small layout) */}
      <div className="text-[9px] text-slate-600 font-mono h-3">
        {current > DB_MIN ? current.toFixed(0) : ''}
      </div>
    </div>
  );
};

export default React.memo(LevelMeter);