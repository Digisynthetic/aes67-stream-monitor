import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  DragStartEvent,
  DragEndEvent
} from '@dnd-kit/core';
import { MonitorSlot, Stream, StreamLevels, TOTAL_SLOTS, NetworkInterface, ChannelLevel, Aes67Device } from './types';
import StreamCard from './components/StreamCard';
import MonitorSlotComponent from './components/MonitorSlot';
import { splitDeviceToGroups } from './utils/deviceGroups';
import { LayoutGrid, Radio, ChevronDown, ChevronRight, Plus, FileText, Languages, AlertTriangle, X, Network, Code, Server } from 'lucide-react';

const TRANSLATIONS = {
  en: {
    streamExplorer: 'Stream Monitor',
    availableStreams: 'Available Streams',
    manualInput: 'Manual Input (SDP)',
    deviceMonitor: 'Online AES67 Devices',
    noStreams: 'No streams detected via SAP.',
    noDevices: 'No AES67 device discovered yet.',
    pasteSdp: 'Paste SDP Data',
    addStream: 'Add Stream',
    monitoringWall: 'Monitoring Wall',
    online: 'Online',
    offline: 'Offline',
    dropHere: 'Drop Stream Here',
    disconnect: 'Disconnect Stream',
    rename: 'Double click to rename',
    manualStream: 'Manual Stream',
    unnamedManual: 'Unnamed Manual Stream',
    placeholderSdp: 'v=0\\no=- 1234 1234 IN IP4 192.168.1.1...',
    streamLost: 'Stream Lost',
    streamLostMessage: 'The following stream has timed out:',
    selectNic: 'Select Network Interface',
    invalidSdpTitle: 'Invalid SDP Data',
    invalidSdpMessage: 'The SDP data is missing required fields (v=, c=, m=). Please check your input.',
    analog: 'Analog',
    network: 'Network',
    phyOut: 'Physical Out',
    netOut: 'Network Out'
  },
  zh: {
    streamExplorer: 'AoIP流监视器',
    availableStreams: '自动发现 (SAP)',
    manualInput: '手动输入 (SDP)',
    deviceMonitor: '在线AES67设备',
    noStreams: '未通过 SAP 发现信号流。',
    noDevices: '暂未发现在线 AES67 设备。',
    pasteSdp: '粘贴 SDP 数据',
    addStream: '添加信号流',
    monitoringWall: '监控墙',
    online: '在线',
    offline: '离线',
    dropHere: '拖拽信号流到此处',
    disconnect: '断开连接',
    rename: '双击重命名',
    manualStream: '手动信号流',
    unnamedManual: '未命名手动流',
    placeholderSdp: 'v=0\\no=- 1234 1234 IN IP4 192.168.1.1...',
    streamLost: '信号丢失',
    streamLostMessage: '以下信号源已超时下线:',
    selectNic: '选择监听网卡',
    invalidSdpTitle: 'SDP 数据无效',
    invalidSdpMessage: 'SDP 数据缺少关键字段 (v=, c=, m=)。请检查输入内容。',
    analog: '模拟',
    network: '网络',
    phyOut: '物理输出',
    netOut: '网络输出'
  }
};

const DBFLOOR = -100;
const PEAK_DECAY = 0.5;

const parseDeviceDb = (value: string | number | undefined): number => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return DBFLOOR;
    return Math.max(DBFLOOR, Math.min(0, value));
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized === '-inf') return DBFLOOR;
    const parsed = parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return Math.max(DBFLOOR, Math.min(0, parsed));
    }
  }

  return DBFLOOR;
};

const calculatePeak = (current: number, previousPeak?: number): number => {
  if (previousPeak === undefined) return current;
  if (current > previousPeak) return current;
  return Math.max(DBFLOOR, previousPeak - PEAK_DECAY);
};

const NotificationToast = ({ message, onClose, title }: { message: string; onClose: () => void; title: string }) => (
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
  const [streams, setStreams] = useState<Stream[]>([]);
  const [devices, setDevices] = useState<Aes67Device[]>([]);
  const [expandedDevices, setExpandedDevices] = useState<Record<string, boolean>>({});
  const [groupTimeoutOffline, setGroupTimeoutOffline] = useState<Record<string, boolean>>({});
  const [slots, setSlots] = useState<MonitorSlot[]>(Array.from({ length: TOTAL_SLOTS }).map((_, i) => ({ id: `slot-${i + 1}`, activeStreamId: null })));

  const [language, setLanguage] = useState<keyof typeof TRANSLATIONS>('en');
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;

  const [expandedSection, setExpandedSection] = useState<'list' | 'manual' | 'device'>('list');
  const [sdpInput, setSdpInput] = useState('');
  const [notification, setNotification] = useState<{ title: string; message: string } | null>(null);

  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [selectedNic, setSelectedNic] = useState<string>('');
  const [streamLevels, setStreamLevels] = useState<StreamLevels>({});
  const [activeDragStream, setActiveDragStream] = useState<Stream | null>(null);

  const activeStreamsRef = useRef<Set<string>>(new Set());

  const deviceGroups = useMemo(() => {
    const all = devices.flatMap((device) => splitDeviceToGroups(device));
    return all.map((group) => {
      const timeoutOffline = !!groupTimeoutOffline[group.id];
      return {
        ...group,
        isOffline: !!group.isOffline || timeoutOffline
      };
    });
  }, [devices, groupTimeoutOffline]);

  const streamsById = useMemo(() => {
    const map = new Map<string, Stream>();
    [...streams, ...deviceGroups].forEach((s) => map.set(s.id, s));
    return map;
  }, [streams, deviceGroups]);

  useEffect(() => {
    const globalApi = (window as any).api;
    if (!globalApi) {
      setInterfaces([{ name: 'Browser Simulation Mode', address: 'Localhost' }]);
      setSelectedNic('Localhost');
      return;
    }

    const unsubscribeSap = globalApi.onSapUpdate?.((data: { streams: Stream[]; removed: string[] } | Stream[]) => {
      let sapStreams: Stream[] = [];
      let removedNames: string[] = [];

      if (Array.isArray(data)) {
        sapStreams = data;
      } else {
        sapStreams = data.streams;
        removedNames = data.removed;
      }

      if (removedNames?.length) {
        setNotification({
          title: t.streamLost,
          message: `${t.streamLostMessage} ${removedNames.join(', ')}`
        });
        setTimeout(() => setNotification(null), 5000);
      }

      setStreams((prevStreams) => {
        const otherStreams = prevStreams.filter((s) => s.sourceType !== 'sap');
        const validatedSapStreams = sapStreams.map((s) => ({ ...s, sourceType: 'sap' as const }));
        return [...otherStreams, ...validatedSapStreams];
      });
    });

    const unsubscribeAudio = globalApi.onAudioLevels?.((levels: Record<string, number[]>) => {
      setStreamLevels((prev) => {
        const next: StreamLevels = { ...prev };

        Object.keys(levels).forEach((id) => {
          const dbValues = Array.isArray(levels[id]) ? levels[id] : [];
          const prevValues = prev[id] || [];

          next[id] = dbValues.map((db, idx) => {
            const prevPeak = prevValues[idx]?.peak || DBFLOOR;
            const peak = db > prevPeak ? db : Math.max(DBFLOOR, prevPeak - PEAK_DECAY);
            return {
              current: db,
              peak,
              clipped: db >= -2,
              offline: false
            };
          });
        });

        return next;
      });
    });

    const unsubscribeDeviceLevels = globalApi.onDeviceLevels?.((payload: { streamId: string; arr: any[]; channels: number; offline?: boolean }) => {
      const channelCount = payload.channels || 0;

      if (payload.offline) {
        setGroupTimeoutOffline((prev) => ({ ...prev, [payload.streamId]: true }));
        setStreamLevels((prev) => ({
          ...prev,
          [payload.streamId]: Array.from({ length: channelCount }).map(() => ({ current: DBFLOOR, peak: DBFLOOR, clipped: false, offline: true }))
        }));
        return;
      }

      const arr = Array.isArray(payload.arr) ? payload.arr : [];
      if (!arr.length) return;

      setGroupTimeoutOffline((prev) => ({ ...prev, [payload.streamId]: false }));

      setStreamLevels((prev) => {
        const previousLevels = prev[payload.streamId] || [];
        const updatedLevels: ChannelLevel[] = [];

        for (let idx = 0; idx < channelCount; idx++) {
          const dbValue = parseDeviceDb(arr[idx]);
          const prevPeak = previousLevels[idx]?.peak;
          const peak = calculatePeak(dbValue, prevPeak);
          updatedLevels.push({
            current: dbValue,
            peak,
            clipped: dbValue >= -2,
            offline: false
          });
        }

        return { ...prev, [payload.streamId]: updatedLevels };
      });
    });

    const unsubscribeDeviceError = globalApi.onDeviceError?.((payload: { streamId: string; name?: string; message?: string; offline?: boolean }) => {
      if (payload.offline) {
        setGroupTimeoutOffline((prev) => ({ ...prev, [payload.streamId]: true }));
      }
      setNotification({
        title: 'Device Polling Status',
        message: `${payload.name || payload.streamId}: ${payload.message || ''}`
      });
      setTimeout(() => setNotification(null), 4000);
    });

    const unsubscribeAes67 = globalApi.onAes67Devices?.((items: Aes67Device[]) => {
      setDevices(Array.isArray(items) ? items : []);
    });

    globalApi.getInterfaces?.().then((nics: NetworkInterface[]) => {
      setInterfaces(nics);
      if (nics.length > 0) {
        const primaryNic = nics[0];
        setSelectedNic(primaryNic.address);
        globalApi.setInterface?.(primaryNic.address);
      }
    });

    return () => {
      unsubscribeSap?.();
      unsubscribeAudio?.();
      unsubscribeDeviceLevels?.();
      unsubscribeDeviceError?.();
      unsubscribeAes67?.();
    };
  }, [language, t.streamLost, t.streamLostMessage]);

  useEffect(() => {
    const requiredStreamIds = new Set(slots.map((s) => s.activeStreamId).filter((id): id is string => id !== null));
    const prevActive = activeStreamsRef.current;
    const globalApi = (window as any).api;

    requiredStreamIds.forEach((id) => {
      if (prevActive.has(id)) return;
      const stream = streamsById.get(id);
      if (!stream || !globalApi) return;

      if (stream.sourceType === 'device-group') {
        globalApi.startDeviceGroupMonitoring?.(stream);
      } else {
        globalApi.startMonitoring?.(stream);
      }
    });

    prevActive.forEach((id) => {
      if (requiredStreamIds.has(id)) return;
      const stream = streamsById.get(id);
      if (!globalApi) return;

      if (stream?.sourceType === 'device-group') {
        globalApi.stopDeviceGroupMonitoring?.(id);
      } else {
        globalApi.stopMonitoring?.(id);
      }

      setStreamLevels((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    activeStreamsRef.current = requiredStreamIds;
  }, [slots, streamsById]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleInterfaceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ip = e.target.value;
    setSelectedNic(ip);
    const globalApi = (window as any).api;
    globalApi?.setInterface?.(ip);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const stream = event.active.data.current?.stream as Stream;
    setActiveDragStream(stream);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragStream(null);

    if (!over || !active.data.current?.stream) return;
    const streamId = active.id as string;
    const slotId = over.id as string;

    setSlots((prev) => prev.map((slot) => (slot.id === slotId ? { ...slot, activeStreamId: streamId } : slot)));
  };

  const handleClearSlot = useCallback((slotId: string) => {
    setSlots((prev) => prev.map((slot) => (slot.id === slotId ? { ...slot, activeStreamId: null } : slot)));
  }, []);

  const handleRenameStream = useCallback((streamId: string, newName: string) => {
    setStreams((prev) => prev.map((stream) => (stream.id === streamId ? { ...stream, name: newName } : stream)));
  }, []);

  const handleDeleteStream = useCallback((streamId: string) => {
    setStreams((prev) => prev.filter((stream) => stream.id !== streamId));

    setStreamLevels((prev) => {
      const copy = { ...prev };
      delete copy[streamId];
      return copy;
    });

    setSlots((prev) => prev.map((slot) => (slot.activeStreamId === streamId ? { ...slot, activeStreamId: null } : slot)));
  }, []);

  const handleAddSdp = () => {
    if (!sdpInput.trim()) return;

    if (!sdpInput.includes('v=') || !sdpInput.includes('c=') || !sdpInput.includes('m=')) {
      setNotification({
        title: t.invalidSdpTitle,
        message: t.invalidSdpMessage
      });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    const lines = sdpInput.split('\\n');
    let name = t.manualStream;
    let ip = 'Unknown IP';
    let port = 5004;
    let channels = 2;
    let sampleRate = 48000;

    lines.forEach((line) => {
      const cleanLine = line.trim();
      if (cleanLine.startsWith('s=')) name = cleanLine.substring(2).trim();
      if (cleanLine.startsWith('c=')) {
        const parts = cleanLine.split(' ');
        if (parts.length >= 3) ip = parts[2].split('/')[0];
      }
      if (cleanLine.startsWith('m=')) {
        const parts = cleanLine.split(' ');
        if (parts.length >= 2) port = parseInt(parts[1], 10) || 5004;
      }
      if (cleanLine.startsWith('a=rtpmap:')) {
        const parts = cleanLine.split('/');
        if (parts.length >= 2) sampleRate = parseInt(parts[1], 10) || sampleRate;
        if (parts.length >= 3) channels = parseInt(parts[2], 10) || channels;
      }
    });

    const newStream: Stream = {
      id: `manual-${Date.now()}`,
      name: name || t.unnamedManual,
      ip: ip || '0.0.0.0',
      port,
      channels,
      sampleRate,
      format: 'L24',
      sourceType: 'manual'
    };

    setStreams((prev) => [newStream, ...prev]);
    setSdpInput('');
    setExpandedSection('list');
  };

  const toggleDeviceExpand = (deviceId: string) => {
    setExpandedDevices((prev) => ({ ...prev, [deviceId]: !prev[deviceId] }));
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-screen w-full bg-transparent text-slate-200 font-sans selection:bg-teal-500/30 relative">
        {notification && <NotificationToast title={notification.title} message={notification.message} onClose={() => setNotification(null)} />}

        <aside className="w-80 flex flex-col border-r border-slate-800 bg-slate-900/80 backdrop-blur-sm z-10">
          <div className="h-16 flex items-center px-4 border-b border-slate-800 bg-slate-900 shadow-sm shrink-0">
            <Radio className="text-teal-400 mr-2" size={20} />
            <h1 className="font-bold text-lg tracking-tight text-white">{t.streamExplorer}</h1>
            <div className="ml-auto text-xs bg-slate-800 px-2 py-1 rounded text-teal-200 border border-slate-700">{streams.length + deviceGroups.length}</div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
            <div className="border-b border-slate-800/50">
              <button
                onClick={() => setExpandedSection((prev) => (prev === 'list' ? 'manual' : 'list'))}
                className="w-full flex items-center px-4 py-3 text-xs font-bold text-slate-400 hover:text-teal-400 hover:bg-slate-800/50 transition-colors uppercase tracking-wider"
              >
                {expandedSection === 'list' ? <ChevronDown size={14} className="mr-2" /> : <ChevronRight size={14} className="mr-2" />}
                {t.availableStreams}
              </button>

              {expandedSection === 'list' && (
                <div className="px-4 pb-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  {streams.length === 0 && <div className="text-center py-8 text-slate-600 italic text-xs">{t.noStreams}</div>}
                  {streams.map((stream) => (
                    <StreamCard key={stream.id} stream={stream} onDelete={stream.sourceType !== 'sap' ? handleDeleteStream : undefined} />
                  ))}
                </div>
              )}
            </div>

            <div className="border-b border-slate-800/50">
              <button
                onClick={() => setExpandedSection((prev) => (prev === 'manual' ? 'list' : 'manual'))}
                className="w-full flex items-center px-4 py-3 text-xs font-bold text-slate-400 hover:text-teal-400 hover:bg-slate-800/50 transition-colors uppercase tracking-wider"
              >
                {expandedSection === 'manual' ? <ChevronDown size={14} className="mr-2" /> : <ChevronRight size={14} className="mr-2" />}
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

            <div>
              <button
                onClick={() => setExpandedSection((prev) => (prev === 'device' ? 'list' : 'device'))}
                className="w-full flex items-center px-4 py-3 text-xs font-bold text-slate-400 hover:text-teal-400 hover:bg-slate-800/50 transition-colors uppercase tracking-wider"
              >
                {expandedSection === 'device' ? <ChevronDown size={14} className="mr-2" /> : <ChevronRight size={14} className="mr-2" />}
                {t.deviceMonitor}
              </button>

              {expandedSection === 'device' && (
                <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200 space-y-3">
                  {devices.length === 0 && <div className="text-center py-6 text-slate-600 italic text-xs">{t.noDevices}</div>}
                  {devices.map((device) => {
                    const groups = deviceGroups.filter((group) => group.deviceGroupConfig?.deviceId === device.devId);
                    const expanded = !!expandedDevices[device.devId];
                    return (
                      <div key={device.devId} className={`rounded-lg border ${device.offline ? 'border-slate-700 bg-slate-900/40 opacity-70' : 'border-slate-700 bg-slate-800/40'}`}>
                        <button onClick={() => toggleDeviceExpand(device.devId)} className="w-full flex items-start justify-between p-3 text-left">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Server size={14} className={device.offline ? 'text-slate-500' : 'text-teal-400'} />
                              <div className="text-sm font-semibold text-slate-100 truncate">{device.name}</div>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${device.offline ? 'bg-slate-800 text-slate-400' : 'bg-emerald-900/60 text-emerald-300'}`}>
                                {device.offline ? t.offline : t.online}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1 truncate">{device.model} | {device.ip}</div>
                            <div className="text-[10px] text-slate-500 mt-1">{t.phyOut}: {device.phyChNumTx} | {t.netOut}: {device.chNumTx}</div>
                          </div>
                          {expanded ? <ChevronDown size={14} className="mt-1 text-slate-500" /> : <ChevronRight size={14} className="mt-1 text-slate-500" />}
                        </button>
                        {expanded && (
                          <div className="px-3 pb-3 space-y-2">
                            {groups.map((group) => (
                              <StreamCard key={group.id} stream={group} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="p-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between bg-slate-950/30 shrink-0">
            <span className="flex items-center gap-1"><Code size={10} /> Powered by Kidney</span>
            <span>V1.0.6</span>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 bg-transparent">
          <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 bg-slate-900/60 backdrop-blur-sm shrink-0">
            <div className="flex items-center gap-3">
              <LayoutGrid className="text-teal-500" size={20} />
              <h2 className="font-semibold text-slate-100">{t.monitoringWall}</h2>
            </div>
            <div className="flex items-center gap-4">
              {interfaces.length > 0 && (
                <div className="flex items-center gap-2 bg-slate-800 rounded-md px-2 py-1 border border-slate-700">
                  <Network size={14} className="text-teal-400" />
                  <select value={selectedNic} onChange={handleInterfaceChange} className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer max-w-[150px]" title={t.selectNic}>
                    {interfaces.map((nic) => (
                      <option key={nic.address} value={nic.address} className="bg-slate-900 text-slate-200">
                        {nic.name} - {nic.address}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2 bg-slate-800 rounded-md px-2 py-1 border border-slate-700">
                <Languages size={14} className="text-slate-400" />
                <select value={language} onChange={(e) => setLanguage(e.target.value as keyof typeof TRANSLATIONS)} className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer font-bold">
                  <option value="en">English</option>
                  <option value="zh">中文</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex-1 p-6 overflow-y-auto">
            <div className="grid grid-cols-2 grid-rows-4 gap-4 h-full min-h-[720px]">
              {slots.map((slot) => {
                const activeStream = slot.activeStreamId ? streamsById.get(slot.activeStreamId) : undefined;
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

        <DragOverlay>{activeDragStream ? <div className="w-80"><StreamCard stream={activeDragStream} isOverlay /></div> : null}</DragOverlay>
      </div>
    </DndContext>
  );
};

export default App;
