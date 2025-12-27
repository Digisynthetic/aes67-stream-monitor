import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Stream } from '../types';
import { Signal, Server, Radio, Hash } from 'lucide-react';

interface StreamCardProps {
  stream: Stream;
  isOverlay?: boolean;
}

const StreamCard: React.FC<StreamCardProps> = ({ stream, isOverlay = false }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: stream.id,
    data: { stream },
  });

  const baseClasses = "p-3 rounded-lg border flex flex-col gap-2 transition-colors cursor-grab active:cursor-grabbing group";
  
  // Updated colors to match logo theme
  const styles = isOverlay
    ? "bg-teal-600 border-teal-400 shadow-[0_0_20px_rgba(45,212,191,0.3)] scale-105 z-50 opacity-100 text-white"
    : isDragging
    ? "bg-slate-800/50 border-slate-700 opacity-40 border-dashed"
    : "bg-slate-800 border-slate-700 hover:border-teal-500/50 hover:bg-slate-750 hover:shadow-lg hover:shadow-teal-900/20";

  // Determine Icon based on source Type
  const renderIcon = () => {
      if (stream.sourceType === 'device') return <Server size={16} className={isOverlay ? "text-white" : "text-amber-400"} />;
      if (stream.sourceType === 'manual') return <Radio size={16} className={isOverlay ? "text-white" : "text-sky-400"} />;
      return <Signal size={16} className={isOverlay ? "text-white" : "text-teal-400"} />;
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`${baseClasses} ${styles}`}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          {renderIcon()}
          <h3 className={`font-semibold text-sm truncate max-w-[150px] ${isOverlay ? 'text-white' : 'text-slate-200'}`}>
            {stream.name}
          </h3>
        </div>
        <div className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isOverlay ? 'bg-teal-700 text-white' : 'bg-slate-900 text-slate-400'}`}>
          {stream.channels}CH
        </div>
      </div>
      
      <div className={`grid grid-cols-2 gap-x-2 text-[10px] font-mono ${isOverlay ? 'text-teal-100' : 'text-slate-400'}`}>
        <div className="flex items-center gap-1 col-span-2 sm:col-span-1">
            <span className="opacity-50">IP:</span> {stream.ip}
        </div>
        
        {stream.sourceType === 'device' && stream.deviceConfig ? (
             <div className="flex items-center gap-1 col-span-2 sm:col-span-1">
                <Hash size={10} className="opacity-50" />
                <span>ID: {stream.deviceConfig.idStart}</span>
             </div>
        ) : (
            <div className="flex items-center gap-1 col-span-2 sm:col-span-1">
                <span className="opacity-50">SR:</span> {stream.sampleRate / 1000}k
            </div>
        )}
      </div>
    </div>
  );
};

export default StreamCard;