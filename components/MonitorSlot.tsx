import React, { useState, useEffect, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { MonitorSlot, Stream, ChannelLevel, TOTAL_SLOTS } from '../types';
import LevelMeter from './LevelMeter';
import { X, Activity, Edit2, Check } from 'lucide-react';

interface MonitorSlotProps {
  slot: MonitorSlot;
  activeStream: Stream | undefined;
  levels: ChannelLevel[] | undefined;
  onClear: (slotId: string) => void;
  onRename?: (streamId: string, newName: string) => void;
  translations?: any;
}

const MonitorSlotComponent: React.FC<MonitorSlotProps> = ({ slot, activeStream, levels, onClear, onRename, translations }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: slot.id,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync tempName when stream changes or starts editing
  useEffect(() => {
    if (activeStream) {
      setTempName(activeStream.name);
    }
  }, [activeStream, isEditing]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSaveRename = () => {
    if (activeStream && onRename && tempName.trim()) {
      onRename(activeStream.id, tempName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      if (activeStream) setTempName(activeStream.name);
    }
    e.stopPropagation(); // Prevent DnD interference
  };

  // Default fallback text if translations not provided
  const t = translations || {
    dropHere: 'Drop Stream Here',
    disconnect: 'Disconnect Stream',
    rename: 'Double click to rename'
  };

  // Updated styling for active/inactive/droppable states
  const borderColor = isOver 
    ? 'border-teal-500 bg-slate-800/80 shadow-[0_0_15px_rgba(20,184,166,0.15)]' 
    : activeStream 
        ? 'border-slate-700 bg-slate-900/60' 
        : 'border-slate-800 bg-slate-900/20';

  return (
    <div
      ref={setNodeRef}
      className={`h-full min-h-[160px] w-full border rounded-xl transition-all duration-200 flex flex-col relative overflow-hidden backdrop-blur-sm ${borderColor}`}
    >
      {!activeStream ? (
        // Empty State
        <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-2">
          <Activity size={32} className="opacity-20" />
          <span className="text-sm font-medium opacity-40 uppercase tracking-widest text-slate-400">
            {t.dropHere} ({slot.id.split('-')[1]})
          </span>
        </div>
      ) : (
        // Active State
        <div className="flex flex-col h-full p-3">
          {/* Header */}
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-700/50 gap-2">
            <div className="flex items-center gap-3 flex-1 min-w-0">
               {/* Active LED */}
               <div className="w-2 h-2 shrink-0 rounded-full bg-teal-400 animate-pulse shadow-[0_0_8px_rgba(45,212,191,0.6)]" />
               
               {/* Name / Rename Input */}
               {isEditing ? (
                 <div className="flex items-center flex-1 gap-1">
                   <input
                     ref={inputRef}
                     type="text"
                     value={tempName}
                     onChange={(e) => setTempName(e.target.value)}
                     onKeyDown={handleKeyDown}
                     onBlur={handleSaveRename}
                     className="flex-1 min-w-0 bg-slate-950/80 border border-teal-500/50 rounded px-2 py-0.5 text-sm text-teal-200 focus:outline-none"
                   />
                   <button 
                      onClick={handleSaveRename}
                      className="text-teal-400 hover:text-teal-300 p-1"
                   >
                     <Check size={14} />
                   </button>
                 </div>
               ) : (
                 <div className="flex items-center gap-2 flex-1 min-w-0 group/title">
                   <span 
                     className="font-bold text-sm text-slate-100 truncate cursor-text"
                     onDoubleClick={() => setIsEditing(true)}
                     title={t.rename}
                   >
                     {activeStream.name}
                   </span>
                   <button 
                      onClick={() => setIsEditing(true)}
                      className="opacity-0 group-hover/title:opacity-100 transition-opacity text-slate-500 hover:text-teal-400"
                   >
                     <Edit2 size={12} />
                   </button>
                   <span className="text-xs text-slate-500 font-mono hidden sm:inline-block ml-auto mr-2 truncate max-w-[100px]">
                     {activeStream.ip}
                   </span>
                 </div>
               )}
            </div>
            
            <button 
                onClick={() => onClear(slot.id)}
                className="text-slate-500 hover:text-red-400 transition-colors p-1 shrink-0"
                title={t.disconnect}
            >
                <X size={16} />
            </button>
          </div>

          {/* Meter Bridge - Changed from flex to grid-cols-8 for fixed column widths */}
          <div className="flex-1 grid grid-cols-8 gap-2 w-full items-end">
            {Array.from({ length: 8 }).map((_, idx) => {
                // Determine if this channel index is active for this stream
                const isActiveChannel = idx < activeStream.channels;

                if (!isActiveChannel) {
                    // Do not render placeholders for unused channels
                    return null;
                }

                const levelData = levels ? levels[idx] : { current: -100, peak: -100 };
                // Adjust label for Device streams to match global ID
                const label = activeStream.sourceType === 'device' && activeStream.deviceConfig
                    ? (activeStream.deviceConfig.idStart + idx).toString()
                    : (idx + 1).toString();

                return (
                    <LevelMeter 
                        key={`${slot.id}-ch-${idx}`} 
                        index={idx} 
                        level={levelData} 
                        channelName={label}
                    />
                );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MonitorSlotComponent;