import React, { useState, useEffect, useCallback } from 'react';
import { 
  DndContext, 
  DragOverlay, 
  useSensor, 
  useSensors, 
  PointerSensor, 
  DragStartEvent, 
  DragEndEvent 
} from '@dnd-kit/core';
import { MonitorSlot, Stream, StreamLevels, TOTAL_SLOTS } from './types';
import StreamCard from './components/StreamCard';
import MonitorSlotComponent from './components/MonitorSlot';
import { LayoutGrid, Radio, Settings, Maximize2, ChevronDown, ChevronRight, Plus, FileText, Globe, Server, Languages, AlertTriangle, X } from 'lucide-react';

const TRANSLATIONS = {
  en: {
    streamExplorer: "Stream Explorer",
    availableStreams: "Available Streams",
    manualInput: "Manual Input (SDP)",
    deviceMonitor: "Device Monitor (UDP)",
    noStreams: "No streams detected via SAP.",
    pasteSdp: "Paste SDP Data",
    addStream: "Add Stream",
    deviceConfig: "Device Configuration",
    deviceName: "Device Name (Opt)",
    ipAddress: "IP Address",
    startId: "Start ID",
    count: "Count (1-8)",
    addMonitor: "Add Monitor",
    monitoringWall: "Monitoring Wall",
    online: "Online",
    dropHere: "Drop Stream Here",
    disconnect: "Disconnect Stream",
    rename: "Double click to rename",
    manualStream: "Manual Stream",
    unnamedManual: "Unnamed Manual Stream",
    deviceDefault: "Device",
    placeholderSdp: "v=0\no=- 1234 1234 IN IP4 192.168.1.1...",
    streamLost: "Stream Lost",
    streamLostMessage: "The following stream has timed out:",
  },
  zh: {
    streamExplorer: "信号源浏览器",
    availableStreams: "自动发现 (SAP)",
    manualInput: "手动输入 (SDP)",
    deviceMonitor: "设备电平 (UDP)",
    noStreams: "未通过 SAP 发现信号流。",
    pasteSdp: "粘贴 SDP 数据",
    addStream: "添加信号流",
    deviceConfig: "设备监听配置",
    deviceName: "设备名称 (选填)",
    ipAddress: "设备 IP 地址",
    startId: "起始通道 ID",
    count: "通道数量 (1-8)",
    addMonitor: "添加监听",
    monitoringWall: "多屏监看墙",
    online: "在线",
    dropHere: "拖拽信号流到此处",
    disconnect: "断开连接",
    rename: "双击重命名",
    manualStream: "手动信号流",
    unnamedManual: "未命名信号流",
    deviceDefault: "设备",
    placeholderSdp: "v=0\no=- 1234 1234 IN IP4 192.168.1.1...",
    streamLost: "信号丢失",
    streamLostMessage: "以下信号源已超时下线:",
  }
};

// Notification Toast Component
const NotificationToast = ({ message, onClose, title }: { message: string, onClose: () => void, title: string }) => (
  <div className="fixed top-20 right-8 z-50 animate-in fade-in slide-in-from-right-10 duration-300">
    <div className="bg-slate-800 border-l-4 border-red-500 text-white p-4 rounded shadow-2xl flex gap-3 min-w-[300px] items-start">
        <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} />
        <div className="flex-1">
            <h4 className="font-bold text-sm text-red-100 mb-1">{title}</h4>
            <p className="text-xs text-slate-300">{message}</p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={16} />
        </button>
    </div>
  </div>
);

const App: React.FC = () => {
  // --- State ---
  const [streams, setStreams] = useState<Stream[]>([]);
  const [slots, setSlots] = useState<MonitorSlot[]>(
    Array.from({ length: TOTAL_SLOTS }).map((_, i) => ({ id: `slot-${i + 1}`, activeStreamId: null }))
  );
  
  // Language State
  const [language, setLanguage] = useState<'en' | 'zh'>('zh');
  const t = TRANSLATIONS[language];

  // Sidebar UI State
  const [expandedSection, setExpandedSection] = useState<'list' | 'manual' | 'device'>('list');
  const [sdpInput, setSdpInput] = useState('');
  
  // Notification State
  const [notification, setNotification] = useState<{title: string, message: string} | null>(null);

  // Device Input State
  const [deviceForm, setDeviceForm] = useState({
    name: '',
    ip: '',
    idStart: '0',
    count: '8'
  });

  // Audio Levels State (Frequent updates)
  const [streamLevels, setStreamLevels] = useState<StreamLevels>({});
  
  // DnD State
  const [activeDragStream, setActiveDragStream] = useState<Stream | null>(null);

  // --- Initialization & SAP Discovery ---
  useEffect(() => {
    // Check if running in Electron with API exposed
    // @ts-ignore
    if (window.api && window.api.onSapUpdate) {
        console.log("Subscribing to SAP updates...");
        // @ts-ignore
        const unsubscribe = window.api.onSapUpdate((data: { streams: Stream[], removed: string[] } | Stream[]) => {
            
            // Handle new protocol format { streams: [], removed: [] } or legacy array
            let sapStreams: Stream[] = [];
            let removedNames: string[] = [];
            
            if (Array.isArray(data)) {
                sapStreams = data;
            } else {
                sapStreams = data.streams;
                removedNames = data.removed;
            }

            // Show notification if streams were removed
            if (removedNames && removedNames.length > 0) {
                setNotification({
                    title: t.streamLost,
                    message: `${t.streamLostMessage} ${removedNames.join(', ')}`
                });
                // Auto hide after 5s
                setTimeout(() => setNotification(null), 5000);
            }

            setStreams(prevStreams => {
                // Preserve manual and device streams, replace SAP streams
                const otherStreams = prevStreams.filter(s => s.sourceType !== 'sap');
                
                // Ensure the incoming SAP streams have the correct type
                const validatedSapStreams = sapStreams.map(s => ({...s, sourceType: 'sap' as const}));
                
                return [...otherStreams, ...validatedSapStreams];
            });
        });
        return () => unsubscribe();
    } else {
        // Fallback: Initialize with empty list (No mock data)
        setStreams([]);
    }
  }, [t.streamLost, t.streamLostMessage]);

  // --- Device Heartbeat (Keep-Alive) ---
  useEffect(() => {
    const heartbeatInterval = setInterval(() => {
      // Filter for device streams that need keep-alive packets
      const deviceStreams = streams.filter(s => s.sourceType === 'device');
      
      if (deviceStreams.length > 0) {
        deviceStreams.forEach(stream => {
           // In a real Electron/Node environment, this would be:
           // const port = stream.deviceConfig?.pollingPort || 8999;
           // udpSocket.send('KEEP_ALIVE', port, stream.ip);
        });
      }
    }, 250); // 250ms interval

    return () => clearInterval(heartbeatInterval);
  }, [streams]);

  // --- Audio Simulation Loop (Placeholder for real data) ---
  useEffect(() => {
    const intervalId = setInterval(() => {
      // Only calculate levels for streams that are currently assigned to slots
      const activeStreamIds = slots
        .map(s => s.activeStreamId)
        .filter((id): id is string => id !== null);

      if (activeStreamIds.length === 0) return;

      setStreamLevels(prevLevels => {
        const newLevels: StreamLevels = { ...prevLevels };
        
        activeStreamIds.forEach(streamId => {
          const stream = streams.find(s => s.id === streamId);
          if (!stream) return;

          // Initialize if needed
          if (!newLevels[streamId]) {
            newLevels[streamId] = Array(8).fill({ current: -100, peak: -100 });
          }

          // Generate audio data based on source type
          newLevels[streamId] = newLevels[streamId].map((ch, idx) => {
            if (idx >= stream.channels) return { current: -100, peak: -100 };
            
            // Silence for production build until IPC connected
            const current = -100;

            // Peak Hold Logic
            let peak = ch.peak;
            if (current > peak) {
                peak = current;
            } else {
                peak = Math.max(-100, peak - 0.5); 
            }

            return { current, peak };
          });
        });
        
        return newLevels;
      });

    }, 50);

    return () => clearInterval(intervalId);
  }, [slots, streams]);

  // --- Drag & Drop Handlers ---
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const stream = active.data.current?.stream as Stream;
    setActiveDragStream(stream);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragStream(null);

    if (over && active.data.current?.stream) {
      const streamId = active.id as string;
      const slotId = over.id as string;

      setSlots(prev => prev.map(slot => {
        if (slot.id === slotId) {
          return { ...slot, activeStreamId: streamId };
        }
        return slot;
      }));
    }
  };

  const handleClearSlot = useCallback((slotId: string) => {
    setSlots(prev => prev.map(slot => 
      slot.id === slotId ? { ...slot, activeStreamId: null } : slot
    ));
    setStreamLevels(prev => {
        const newLevels = { ...prev };
        const slot = slots.find(s => s.id === slotId);
        if (slot?.activeStreamId) {
            delete newLevels[slot.activeStreamId];
        }
        return newLevels;
    });
  }, [slots]);

  // --- Stream Management ---
  const handleRenameStream = useCallback((streamId: string, newName: string) => {
    setStreams(prev => prev.map(stream => 
      stream.id === streamId 
        ? { ...stream, name: newName }
        : stream
    ));
  }, []);

  const handleAddSdp = () => {
    if (!sdpInput.trim()) return;

    // Basic Parsing of SDP
    const lines = sdpInput.split('\n');
    let name = t.manualStream;
    let ip = 'Unknown IP';
    
    // Attempt to extract s= (Session Name) and c= (Connection Data)
    lines.forEach(line => {
        const cleanLine = line.trim();
        if (cleanLine.startsWith('s=')) {
            name = cleanLine.substring(2).trim();
        }
        if (cleanLine.startsWith('c=')) {
            const parts = cleanLine.split(' ');
            if (parts.length >= 3) {
                ip = parts[2].split('/')[0];
            }
        }
    });

    const newStream: Stream = {
        id: `manual-${Date.now()}`,
        name: name || t.unnamedManual,
        ip: ip || '0.0.0.0',
        channels: 8,
        sampleRate: 48000,
        format: 'L24',
        sourceType: 'manual'
    };

    setStreams(prev => [newStream, ...prev]);
    setSdpInput('');
    setExpandedSection('list');
  };

  const handleAddDevice = () => {
      const { name, ip, idStart, count } = deviceForm;
      if (!ip.trim()) return;

      const channels = Math.min(8, Math.max(1, parseInt(count) || 8));
      const start = parseInt(idStart) || 0;
      
      const newStream: Stream = {
          id: `device-${Date.now()}`,
          name: name.trim() || `${t.deviceDefault} ${ip}`,
          ip: ip,
          channels: channels,
          sampleRate: 48000,
          format: 'JSON',
          sourceType: 'device',
          deviceConfig: {
              idStart: start,
              pollingPort: 8999
          }
      };

      setStreams(prev => [newStream, ...prev]);
      setDeviceForm({ name: '', ip: '', idStart: '0', count: '8' });
      setExpandedSection('list');
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'zh' : 'en');
  };

  return (
    <DndContext 
      sensors={sensors} 
      onDragStart={handleDragStart} 
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-screen w-full bg-transparent text-slate-200 font-sans selection:bg-teal-500/30 relative">
        
        {/* Notification Toast */}
        {notification && (
            <NotificationToast 
                title={notification.title} 
                message={notification.message} 
                onClose={() => setNotification(null)} 
            />
        )}

        {/* --- LEFT SIDEBAR: Stream Explorer --- */}
        <aside className="w-80 flex flex-col border-r border-slate-800 bg-slate-900/80 backdrop-blur-sm z-10">
          {/* Header */}
          <div className="h-16 flex items-center px-4 border-b border-slate-800 bg-slate-900 shadow-sm shrink-0">
            <Radio className="text-teal-400 mr-2" size={20} />
            <h1 className="font-bold text-lg tracking-tight text-white">{t.streamExplorer}</h1>
            <div className="ml-auto text-xs bg-slate-800 px-2 py-1 rounded text-teal-200 border border-slate-700">
              {streams.length}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
            
            {/* Section 1: Discovered / Available Streams */}
            <div className="border-b border-slate-800/50">
              <button 
                onClick={() => setExpandedSection(prev => prev === 'list' ? 'manual' : 'list')}
                className="w-full flex items-center px-4 py-3 text-xs font-bold text-slate-400 hover:text-teal-400 hover:bg-slate-800/50 transition-colors uppercase tracking-wider"
              >
                {expandedSection === 'list' ? <ChevronDown size={14} className="mr-2"/> : <ChevronRight size={14} className="mr-2"/>}
                {t.availableStreams}
              </button>
              
              {expandedSection === 'list' && (
                <div className="px-4 pb-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    {streams.length === 0 && (
                        <div className="text-center py-8 text-slate-600 italic text-xs">
                            {t.noStreams}
                        </div>
                    )}
                    {streams.map(stream => (
                    <StreamCard key={stream.id} stream={stream} />
                    ))}
                </div>
              )}
            </div>

            {/* Section 2: Manual Input */}
            <div className="border-b border-slate-800/50">
              <button 
                onClick={() => setExpandedSection(prev => prev === 'manual' ? 'list' : 'manual')}
                className="w-full flex items-center px-4 py-3 text-xs font-bold text-slate-400 hover:text-teal-400 hover:bg-slate-800/50 transition-colors uppercase tracking-wider"
              >
                {expandedSection === 'manual' ? <ChevronDown size={14} className="mr-2"/> : <ChevronRight size={14} className="mr-2"/>}
                {t.manualInput}
              </button>
              
              {expandedSection === 'manual' && (
                <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700">
                        <div className="flex items-center gap-2 mb-2 text-teal-400 text-xs font-mono">
                            <FileText size={12} />
                            <span>{t.pasteSdp}</span>
                        </div>
                        <textarea
                            value={sdpInput}
                            onChange={(e) => setSdpInput(e.target.value)}
                            placeholder={t.placeholderSdp}
                            className="w-full h-32 bg-slate-950/50 border border-slate-700 rounded p-2 text-[10px] font-mono text-slate-300 focus:outline-none focus:border-teal-500/50 resize-none mb-3"
                        />
                        <button 
                            onClick={handleAddSdp}
                            disabled={!sdpInput.trim()}
                            className="w-full py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-teal-900/20"
                        >
                            <Plus size={14} />
                            {t.addStream}
                        </button>
                    </div>
                </div>
              )}
            </div>

            {/* Section 3: Device Monitor */}
            <div>
              <button 
                onClick={() => setExpandedSection(prev => prev === 'device' ? 'list' : 'device')}
                className="w-full flex items-center px-4 py-3 text-xs font-bold text-slate-400 hover:text-teal-400 hover:bg-slate-800/50 transition-colors uppercase tracking-wider"
              >
                {expandedSection === 'device' ? <ChevronDown size={14} className="mr-2"/> : <ChevronRight size={14} className="mr-2"/>}
                {t.deviceMonitor}
              </button>
              
              {expandedSection === 'device' && (
                <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700 space-y-3">
                        <div className="flex items-center gap-2 mb-2 text-teal-400 text-xs font-mono">
                            <Server size={12} />
                            <span>{t.deviceConfig}</span>
                        </div>
                        
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">{t.deviceName}</label>
                            <input
                                type="text"
                                value={deviceForm.name}
                                onChange={e => setDeviceForm({...deviceForm, name: e.target.value})}
                                placeholder="e.g., Stage Box 1"
                                className="w-full bg-slate-950/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">{t.ipAddress}</label>
                            <input
                                type="text"
                                value={deviceForm.ip}
                                onChange={e => setDeviceForm({...deviceForm, ip: e.target.value})}
                                placeholder="192.168.1.100"
                                className="w-full bg-slate-950/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
                            />
                        </div>

                        <div className="flex gap-2">
                             <div className="flex-1">
                                <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">{t.startId}</label>
                                <input
                                    type="number"
                                    value={deviceForm.idStart}
                                    onChange={e => setDeviceForm({...deviceForm, idStart: e.target.value})}
                                    placeholder="0"
                                    className="w-full bg-slate-950/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
                                />
                             </div>
                             <div className="flex-1">
                                <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">{t.count}</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="8"
                                    value={deviceForm.count}
                                    onChange={e => setDeviceForm({...deviceForm, count: e.target.value})}
                                    placeholder="8"
                                    className="w-full bg-slate-950/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
                                />
                             </div>
                        </div>

                        <button 
                            onClick={handleAddDevice}
                            disabled={!deviceForm.ip}
                            className="w-full py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-teal-900/20 mt-1"
                        >
                            <Plus size={14} />
                            {t.addMonitor}
                        </button>
                    </div>
                </div>
              )}
            </div>

          </div>

           {/* Footer */}
           <div className="p-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between bg-slate-950/30 shrink-0">
              <span className="flex items-center gap-1"><Globe size={10}/> {t.online}</span>
              <span>v1.0.1 Pro</span>
           </div>
        </aside>

        {/* --- RIGHT PANEL: Monitoring Wall --- */}
        <main className="flex-1 flex flex-col min-w-0 bg-transparent">
           {/* Toolbar */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 bg-slate-900/60 backdrop-blur-sm shrink-0">
             <div className="flex items-center gap-3">
                <LayoutGrid className="text-teal-500" size={20} />
                <h2 className="font-semibold text-slate-100">{t.monitoringWall}</h2>
             </div>
             <div className="flex items-center gap-4">
                 <button 
                   onClick={toggleLanguage}
                   className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-bold border border-slate-700"
                   title="Switch Language"
                 >
                    <Languages size={14} />
                    <span>{language === 'en' ? 'EN' : '中文'}</span>
                 </button>
                 <div className="h-4 w-px bg-slate-700" />
                 <button className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                    <Settings size={18} className="text-slate-400 hover:text-teal-400" />
                 </button>
                 <button className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                    <Maximize2 size={18} className="text-slate-400 hover:text-teal-400" />
                 </button>
             </div>
          </div>

          {/* Grid Area */}
          <div className="flex-1 p-6 overflow-y-auto">
             <div className="grid grid-cols-2 grid-rows-4 gap-4 h-full min-h-[720px]">
                {slots.map(slot => {
                    const activeStream = streams.find(s => s.id === slot.activeStreamId);
                    return (
                        <MonitorSlotComponent 
                            key={slot.id} 
                            slot={slot}
                            activeStream={activeStream}
                            levels={activeStream ? streamLevels[activeStream.id] : undefined}
                            onClear={handleClearSlot}
                            onRename={handleRenameStream}
                            translations={t}
                        />
                    );
                })}
             </div>
          </div>
        </main>

        {/* --- Drag Overlay (Visual Feedback) --- */}
        <DragOverlay>
          {activeDragStream ? (
            <div className="w-80">
                <StreamCard stream={activeDragStream} isOverlay />
            </div>
          ) : null}
        </DragOverlay>

      </div>
    </DndContext>
  );
};

export default App;