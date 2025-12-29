import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  DndContext, 
  DragOverlay, 
  useSensor, 
  useSensors, 
  PointerSensor, 
  DragStartEvent, 
  DragEndEvent 
} from '@dnd-kit/core';
import { MonitorSlot, Stream, StreamLevels, TOTAL_SLOTS, NetworkInterface, ChannelLevel } from './types';
import StreamCard from './components/StreamCard';
import MonitorSlotComponent from './components/MonitorSlot';
import { LayoutGrid, Radio, Settings, Maximize2, ChevronDown, ChevronRight, Plus, FileText, Globe, Server, Languages, AlertTriangle, X, Network, Code } from 'lucide-react';

const TRANSLATIONS = {
  en: {
    streamExplorer: "Stream Monitor",
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
    selectNic: "Select Network Interface",
    invalidIpTitle: "Invalid IP Address",
    invalidIpMessage: "Please enter a valid IPv4 address (e.g., 239.1.2.3 or 192.168.1.10).",
    invalidSdpTitle: "Invalid SDP Data",
    invalidSdpMessage: "The SDP data is missing required fields (v=, c=, m=). Please check your input.",
  },
  zh: {
    streamExplorer: "AoIP流监视器",
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
    selectNic: "选择监听网卡",
    invalidIpTitle: "无效 IP 地址",
    invalidIpMessage: "请输入有效的 IPv4 地址 (例如 239.1.2.3 或 192.168.1.10)。",
    invalidSdpTitle: "SDP 数据无效",
    invalidSdpMessage: "SDP 数据缺少关键字段 (v=, c=, m=)。请检查输入内容。",
  },
  ja: {
    streamExplorer: "AoIPストリームモニター",
    availableStreams: "利用可能なストリーム (SAP)",
    manualInput: "手動入力 (SDP)",
    deviceMonitor: "デバイスモニター (UDP)",
    noStreams: "SAP経由のストリームが検出されませんでした。",
    pasteSdp: "SDPデータを貼り付け",
    addStream: "ストリームを追加",
    deviceConfig: "デバイス構成",
    deviceName: "デバイス名 (任意)",
    ipAddress: "IPアドレス",
    startId: "開始ID",
    count: "数 (1-8)",
    addMonitor: "モニターを追加",
    monitoringWall: "監視ウォール",
    online: "オンライン",
    dropHere: "ここにストリームをドロップ",
    disconnect: "切断",
    rename: "ダブルクリックで名前を変更",
    manualStream: "手動ストリーム",
    unnamedManual: "無名の手動ストリーム",
    deviceDefault: "デバイス",
    placeholderSdp: "v=0\no=- 1234 1234 IN IP4 192.168.1.1...",
    streamLost: "ストリーム損失",
    streamLostMessage: "次のストリームがタイムアウトしました:",
    selectNic: "ネットワークインターフェースを選択",
    invalidIpTitle: "無効なIPアドレス",
    invalidIpMessage: "有効なIPv4アドレスを入力してください（例：239.1.2.3 または 192.168.1.10）。",
    invalidSdpTitle: "無効なSDPデータ",
    invalidSdpMessage: "SDPデータに必要なフィールド（v=, c=, m=）が不足しています。入力を確認してください。",
  },
  fr: {
    streamExplorer: "Moniteur de Flux",
    availableStreams: "Flux Disponibles (SAP)",
    manualInput: "Entrée Manuelle (SDP)",
    deviceMonitor: "Moniteur d'Appareil (UDP)",
    noStreams: "Aucun flux détecté via SAP.",
    pasteSdp: "Coller les données SDP",
    addStream: "Ajouter un Flux",
    deviceConfig: "Configuration de l'Appareil",
    deviceName: "Nom (Opt)",
    ipAddress: "Adresse IP",
    startId: "ID de Début",
    count: "Nombre (1-8)",
    addMonitor: "Ajouter Moniteur",
    monitoringWall: "Mur de Surveillance",
    online: "En Ligne",
    dropHere: "Déposer le Flux Ici",
    disconnect: "Déconnecter",
    rename: "Double-cliquer pour renommer",
    manualStream: "Flux Manuel",
    unnamedManual: "Flux Manuel Sans Nom",
    deviceDefault: "Appareil",
    placeholderSdp: "v=0\no=- 1234 1234 IN IP4 192.168.1.1...",
    streamLost: "Flux Perdu",
    streamLostMessage: "Le flux suivant a expiré :",
    selectNic: "Choisir l'Interface Réseau",
    invalidIpTitle: "Adresse IP Invalide",
    invalidIpMessage: "Veuillez entrer une adresse IPv4 valide (ex: 239.1.2.3 ou 192.168.1.10).",
    invalidSdpTitle: "Données SDP Invalides",
    invalidSdpMessage: "Les données SDP manquent de champs requis (v=, c=, m=). Veuillez vérifier votre entrée.",
  },
  de: {
    streamExplorer: "Stream-Monitor",
    availableStreams: "Verfügbare Streams (SAP)",
    manualInput: "Manuelle Eingabe (SDP)",
    deviceMonitor: "Gerätemonitor (UDP)",
    noStreams: "Keine Streams über SAP erkannt.",
    pasteSdp: "SDP-Daten einfügen",
    addStream: "Stream hinzufügen",
    deviceConfig: "Gerätekonfiguration",
    deviceName: "Gerätename (Opt)",
    ipAddress: "IP-Adresse",
    startId: "Start-ID",
    count: "Anzahl (1-8)",
    addMonitor: "Monitor hinzufügen",
    monitoringWall: "Überwachungswand",
    online: "Online",
    dropHere: "Stream hier ablegen",
    disconnect: "Trennen",
    rename: "Doppelklick zum Umbenennen",
    manualStream: "Manueller Stream",
    unnamedManual: "Unbenannter manueller Stream",
    deviceDefault: "Gerät",
    placeholderSdp: "v=0\no=- 1234 1234 IN IP4 192.168.1.1...",
    streamLost: "Stream verloren",
    streamLostMessage: "Der folgende Stream hat das Zeitlimit überschritten:",
    selectNic: "Netzwerkschnittstelle auswählen",
    invalidIpTitle: "Ungültige IP-Adresse",
    invalidIpMessage: "Bitte geben Sie eine gültige IPv4-Adresse ein (z. B. 239.1.2.3 oder 192.168.1.10).",
    invalidSdpTitle: "Ungültige SDP-Daten",
    invalidSdpMessage: "Den SDP-Daten fehlen erforderliche Felder (v=, c=, m=). Bitte überprüfen Sie Ihre Eingabe.",
  },
  ko: {
    streamExplorer: "AoIP 스트림 모니터",
    availableStreams: "사용 가능한 스트림 (SAP)",
    manualInput: "수동 입력 (SDP)",
    deviceMonitor: "장치 모니터 (UDP)",
    noStreams: "SAP를 통해 감지된 스트림이 없습니다.",
    pasteSdp: "SDP 데이터 붙여넣기",
    addStream: "스트림 추가",
    deviceConfig: "장치 구성",
    deviceName: "장치 이름 (선택)",
    ipAddress: "IP 주소",
    startId: "시작 ID",
    count: "개수 (1-8)",
    addMonitor: "모니터 추가",
    monitoringWall: "모니터링 월",
    online: "온라인",
    dropHere: "여기에 스트림 드롭",
    disconnect: "연결 해제",
    rename: "더블 클릭하여 이름 변경",
    manualStream: "수동 스트림",
    unnamedManual: "이름 없는 수동 스트림",
    deviceDefault: "장치",
    placeholderSdp: "v=0\no=- 1234 1234 IN IP4 192.168.1.1...",
    streamLost: "스트림 손실",
    streamLostMessage: "다음 스트림의 시간이 초과되었습니다:",
    selectNic: "네트워크 인터페이스 선택",
    invalidIpTitle: "유효하지 않은 IP 주소",
    invalidIpMessage: "유효한 IPv4 주소를 입력하십시오 (예: 239.1.2.3 또는 192.168.1.10).",
    invalidSdpTitle: "유효하지 않은 SDP 데이터",
    invalidSdpMessage: "SDP 데이터에 필수 필드 (v=, c=, m=)가 누락되었습니다. 입력을 확인하십시오.",
  },
  es: {
    streamExplorer: "Monitor de Flujo",
    availableStreams: "Flujos Disponibles (SAP)",
    manualInput: "Entrada Manual (SDP)",
    deviceMonitor: "Monitor de Dispositivo (UDP)",
    noStreams: "No se detectaron flujos vía SAP.",
    pasteSdp: "Pegar datos SDP",
    addStream: "Añadir Flujo",
    deviceConfig: "Configuración del Dispositivo",
    deviceName: "Nombre (Opt)",
    ipAddress: "Dirección IP",
    startId: "ID Inicial",
    count: "Cantidad (1-8)",
    addMonitor: "Añadir Monitor",
    monitoringWall: "Muro de Monitoreo",
    online: "En Línea",
    dropHere: "Soltar Flujo Aquí",
    disconnect: "Desconectar",
    rename: "Doble clic para renombrar",
    manualStream: "Flujo Manual",
    unnamedManual: "Flujo Manual Sin Nombre",
    deviceDefault: "Dispositivo",
    placeholderSdp: "v=0\no=- 1234 1234 IN IP4 192.168.1.1...",
    streamLost: "Flujo Perdido",
    streamLostMessage: "El siguiente flujo ha expirado:",
    selectNic: "Seleccionar Interfaz de Red",
    invalidIpTitle: "Dirección IP Inválida",
    invalidIpMessage: "Por favor, introduzca una dirección IPv4 válida (ej: 239.1.2.3 o 192.168.1.10).",
    invalidSdpTitle: "Datos SDP Inválidos",
    invalidSdpMessage: "Faltan campos obligatorios en los datos SDP (v=, c=, m=). Por favor, verifique su entrada.",
  },
  it: {
    streamExplorer: "Monitor di Flusso",
    availableStreams: "Flussi Disponibili (SAP)",
    manualInput: "Input Manuale (SDP)",
    deviceMonitor: "Monitor Dispositivo (UDP)",
    noStreams: "Nessun flusso rilevato via SAP.",
    pasteSdp: "Incolla Dati SDP",
    addStream: "Aggiungi Flusso",
    deviceConfig: "Configurazione Dispositivo",
    deviceName: "Nome (Opz)",
    ipAddress: "Indirizzo IP",
    startId: "ID Iniziale",
    count: "Conteggio (1-8)",
    addMonitor: "Aggiungi Monitor",
    monitoringWall: "Parete di Monitoraggio",
    online: "Online",
    dropHere: "Rilascia Flusso Qui",
    disconnect: "Disconnetti",
    rename: "Doppio clic per rinominare",
    manualStream: "Flusso Manuale",
    unnamedManual: "Flusso Manuale Senza Nome",
    deviceDefault: "Dispositivo",
    placeholderSdp: "v=0\no=- 1234 1234 IN IP4 192.168.1.1...",
    streamLost: "Flusso Perso",
    streamLostMessage: "Il seguente flusso è scaduto:",
    selectNic: "Seleziona Interfaccia di Rete",
    invalidIpTitle: "Indirizzo IP Non Valido",
    invalidIpMessage: "Inserisci un indirizzo IPv4 valido (es: 239.1.2.3 o 192.168.1.10).",
    invalidSdpTitle: "Dati SDP Non Validi",
    invalidSdpMessage: "Mancano campi obbligatori nei dati SDP (v=, c=, m=). Controlla il tuo input.",
  }
};

const DEVICE_COMMAND_PAYLOAD = `{
  "ops": "getVolumeDbBatchIn",
  "idStart": "0"
}`;

const DEVICE_COMMAND_RESPONSE = `{
  "ops": "getVolumeDbBatchIn",
  "idStart": "0",
  "arr": ["-97.4068"],
  "idNext": "0",
  "result": "succ"
}`;

const DEVICE_COMMAND_COPY = {
  en: {
    title: "Batch Level Query",
    description: "Send this JSON to UDP port 8999 to pull input channel meter readings starting at the given index.",
    commandLabel: "Command",
    responseLabel: "Sample Response",
    noteChannelStart: "`idStart` corresponds to channel IDs (0 = channel 1).",
    noteIdNext: "`idNext` tells you the next channel index to request; when it matches `idStart`, all configured channels were returned.",
    noteArr: "`arr` contains dBFS readings (-inf … 0) for each channel in order."
  },
  zh: {
    title: "批量电平查询",
    description: "将此 JSON 发送到设备的 UDP 8999 端口，可从指定 ID 开始批量获取输入通道电平。",
    commandLabel: "请求命令",
    responseLabel: "示例响应",
    noteChannelStart: "`idStart` 表示通道编号（0 表示通道 1）。",
    noteIdNext: "`idNext` 指示下次继续查询的通道索引；当它等于 `idStart` 时表示所有通道都已获取。",
    noteArr: "`arr` 按顺序包含各通道的 dBFS 电平，取值范围从 -inf 到 0。"
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
  const [language, setLanguage] = useState<keyof typeof TRANSLATIONS>('zh');
  const t = TRANSLATIONS[language];
  const deviceCommandMeta = DEVICE_COMMAND_COPY[language] || DEVICE_COMMAND_COPY.en;

  // Sidebar UI State
  const [expandedSection, setExpandedSection] = useState<'list' | 'manual' | 'device'>('list');
  const [sdpInput, setSdpInput] = useState('');
  
  // Notification State
  const [notification, setNotification] = useState<{title: string, message: string} | null>(null);

  // Network Interfaces State
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [selectedNic, setSelectedNic] = useState<string>('');

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

  // Ref to track active streams for start/stop logic
  const activeStreamsRef = useRef<Set<string>>(new Set());

  // --- Initialization & SAP Discovery ---
  useEffect(() => {
    // Check if running in Electron with API exposed
    // @ts-ignore
    if (window.api) {
        // SAP Updates
        // @ts-ignore
        if (window.api.onSapUpdate) {
            console.log("Subscribing to SAP updates...");
            // @ts-ignore
            const unsubscribeSap = window.api.onSapUpdate((data: { streams: Stream[], removed: string[] } | Stream[]) => {
                let sapStreams: Stream[] = [];
                let removedNames: string[] = [];
                
                if (Array.isArray(data)) {
                    sapStreams = data;
                } else {
                    sapStreams = data.streams;
                    removedNames = data.removed;
                }

                if (removedNames && removedNames.length > 0) {
                    setNotification({
                        title: t.streamLost,
                        message: `${t.streamLostMessage} ${removedNames.join(', ')}`
                    });
                    setTimeout(() => setNotification(null), 5000);
                }

                setStreams(prevStreams => {
                    // Keep manual/device streams, replace SAP streams
                    const otherStreams = prevStreams.filter(s => s.sourceType !== 'sap');
                    const validatedSapStreams = sapStreams.map(s => ({...s, sourceType: 'sap' as const}));
                    return [...otherStreams, ...validatedSapStreams];
                });
            });

            // Audio Levels Update (4Hz from backend)
            // @ts-ignore
            const unsubscribeAudio = window.api.onAudioLevels((levels: any) => {
                setStreamLevels(prev => {
                    // Merge new levels with existing, or just replace relevant IDs
                    // Backend sends { streamId: [db, db, ...] }
                    const newLevels: StreamLevels = {};
                    
                    // Process backend levels (simple array of numbers) to {current, peak} structure
                    Object.keys(levels).forEach(id => {
                        const dbValues: number[] = levels[id];
                        const prevValues = prev[id] || [];
                        
                        const newChannelLevels = dbValues.map((db, idx) => {
                            // Calculate Peak Hold in Frontend
                            const prevPeak = prevValues[idx]?.peak || -100;
                            let peak = prevPeak;
                            
                            if (db > peak) {
                                peak = db;
                            } else {
                                // Decay peak
                                peak = Math.max(-100, peak - 0.5); 
                            }
                            return { current: db, peak };
                        });
                        
                        newLevels[id] = newChannelLevels;
                    });
                    
                    return { ...prev, ...newLevels };
                });
            });

            const unsubscribeDeviceLevels = window.api.onDeviceLevels((payload: { streamId: string; arr: any[]; channels: number }) => {
                const arr = Array.isArray(payload.arr) ? payload.arr : [];
                if (!arr.length) return;
                const channelCount = payload.channels || arr.length;

                setStreamLevels(prev => {
                    const previousLevels = prev[payload.streamId] || [];
                    const updatedLevels: ChannelLevel[] = [];

                    for (let idx = 0; idx < channelCount; idx++) {
                        const dbValue = parseDeviceDb(arr[idx]);
                        const prevPeak = previousLevels[idx]?.peak;
                        const peak = calculatePeak(dbValue, prevPeak);
                        updatedLevels.push({ current: dbValue, peak });
                    }

                    return { ...prev, [payload.streamId]: updatedLevels };
                });
            });

            const unsubscribeDeviceError = window.api.onDeviceError((payload: { streamId: string; name?: string; message?: string }) => {
                const title = (t as any).deviceErrorTitle || 'Device Polling Error';
                const message = payload.message || ((t as any).deviceErrorMessage || 'No channel levels were returned from the device.');
                setNotification({
                    title,
                    message: `${payload.name || payload.streamId}: ${message}`
                });
                setTimeout(() => setNotification(null), 5000);
            });
            
            // Initial Interface Fetch
            // @ts-ignore
            if (window.api.getInterfaces) {
                // @ts-ignore
                window.api.getInterfaces().then((nics: NetworkInterface[]) => {
                    setInterfaces(nics);
                    if (nics.length > 0) {
                        const primaryNic = nics[0];
                        setSelectedNic(primaryNic.address);
                        // @ts-ignore
                        if (window.api && window.api.setInterface) {
                            window.api.setInterface(primaryNic.address);
                        }
                    }
                });
            }

            return () => {
                unsubscribeSap();
                unsubscribeAudio();
                unsubscribeDeviceLevels();
                unsubscribeDeviceError();
            };
        }
    } else {
        // Fallback: Browser Development Mode (Mock Data)
        setStreams([]);
        setInterfaces([
            { name: "Browser Simulation Mode", address: "Localhost" }
        ]);
        setSelectedNic("Localhost");
    }
  }, [language]);

  // --- Monitoring Logic (Start/Stop Backend Monitoring) ---
  useEffect(() => {
    // Determine which streams should be active based on slots
    const requiredStreamIds = new Set(
        slots.map(s => s.activeStreamId).filter((id): id is string => id !== null)
    );

    const prevActive = activeStreamsRef.current;

    // Find streams to start
    requiredStreamIds.forEach(id => {
        if (!prevActive.has(id)) {
            // Find full stream object
            const stream = streams.find(s => s.id === id);
            if (stream) {
                console.log("Start monitoring:", stream.name);
                // @ts-ignore
                if (window.api && window.api.startMonitoring) {
                    // @ts-ignore
                    window.api.startMonitoring(stream);
                }
            }
        }
    });

    // Find streams to stop
    prevActive.forEach(id => {
        if (!requiredStreamIds.has(id)) {
            console.log("Stop monitoring:", id);
            // @ts-ignore
            if (window.api && window.api.stopMonitoring) {
                 // @ts-ignore
                window.api.stopMonitoring(id);
                
                // Cleanup levels
                setStreamLevels(prev => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                });
            }
        }
    });

    // Update ref
    activeStreamsRef.current = requiredStreamIds;

  }, [slots, streams]);

  const handleInterfaceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ip = e.target.value;
    setSelectedNic(ip);
    // @ts-ignore
    if (window.api && window.api.setInterface) {
        // @ts-ignore
        window.api.setInterface(ip);
    }
  };

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
  }, []);

  // --- Stream Management ---
  const handleRenameStream = useCallback((streamId: string, newName: string) => {
    setStreams(prev => prev.map(stream => 
      stream.id === streamId 
        ? { ...stream, name: newName }
        : stream
    ));
  }, []);

  const handleDeleteStream = useCallback((streamId: string) => {
    // Only allow deletion of manual or device streams (client-side only removal)
    setStreams(prev => {
      const toRemove = prev.find(stream => stream.id === streamId);
      if (toRemove?.sourceType === 'device') {
        const globalApi = (window as any).api;
        if (globalApi?.stopDeviceMonitoring) {
          globalApi.stopDeviceMonitoring(streamId);
        }
      }
      return prev.filter(stream => stream.id !== streamId);
    });

    setStreamLevels(prev => {
      const copy = { ...prev };
      delete copy[streamId];
      return copy;
    });

    // Also clear from any active slot
    setSlots(prev => prev.map(slot =>
        slot.activeStreamId === streamId ? { ...slot, activeStreamId: null } : slot
    ));
  }, []);

  const handleAddSdp = () => {
    if (!sdpInput.trim()) return;

    // Validate SDP minimal requirements
    // Must contain v=, c=, m=
    if (!sdpInput.includes('v=') || !sdpInput.includes('c=') || !sdpInput.includes('m=')) {
        setNotification({
            title: t.invalidSdpTitle,
            message: t.invalidSdpMessage
        });
        setTimeout(() => setNotification(null), 4000);
        return;
    }

    // Basic Parsing of SDP
    const lines = sdpInput.split('\n');
    let name = t.manualStream;
    let ip = 'Unknown IP';
    let port = 5004;
    let channels = 2; // Default to stereo
    let sampleRate = 48000;
    
    // Attempt to extract s=, c=, m=, and a=rtpmap
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
        if (cleanLine.startsWith('m=')) {
            const parts = cleanLine.split(' ');
            if (parts.length >= 2) port = parseInt(parts[1]) || 5004;
        }
        if (cleanLine.startsWith('a=rtpmap:')) {
            // format: a=rtpmap:<payloadType> <encodingName>/<clockRate>[/<encodingParameters>]
            // example: a=rtpmap:96 L24/48000/6
            const parts = cleanLine.split('/');
            if (parts.length >= 2) {
                const parsedRate = parseInt(parts[1]);
                if (!isNaN(parsedRate)) sampleRate = parsedRate;
            }
            if (parts.length >= 3) {
                const parsedChannels = parseInt(parts[2]);
                if (!isNaN(parsedChannels)) {
                    channels = parsedChannels;
                }
            }
        }
    });

    const newStream: Stream = {
        id: `manual-${Date.now()}`,
        name: name || t.unnamedManual,
        ip: ip || '0.0.0.0',
        port: port,
        channels: channels, // Dynamic channels from SDP
        sampleRate: sampleRate,
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

      // IPv4 Regex Validation
      // Checks for 4 groups of 0-255 separated by dots
      const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      
      if (!ipv4Regex.test(ip.trim())) {
          setNotification({
              title: t.invalidIpTitle,
              message: t.invalidIpMessage
          });
          setTimeout(() => setNotification(null), 4000);
          return;
      }

      const channels = Math.min(8, Math.max(1, parseInt(count) || 8));
      const start = parseInt(idStart) || 0;
      
      const newStream: Stream = {
          id: `device-${Date.now()}`,
          name: name.trim() || `${t.deviceDefault} ${ip}`,
          ip: ip.trim(),
          port: 8999, // Placeholder for device port
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
      const globalApi = (window as any).api;
      if (globalApi?.startDeviceMonitoring) {
          globalApi.startDeviceMonitoring(newStream);
      }
      setDeviceForm({ name: '', ip: '', idStart: '0', count: '8' });
      setExpandedSection('list');
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
                    <StreamCard 
                        key={stream.id} 
                        stream={stream} 
                        onDelete={stream.sourceType !== 'sap' ? handleDeleteStream : undefined}
                    />
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
                        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 mt-2 text-[10px] text-slate-300 space-y-2">
                            <div className="text-[10px] uppercase tracking-wider text-teal-400 font-semibold">
                                {deviceCommandMeta.title}
                            </div>
                            <p className="text-[10px] leading-relaxed text-slate-300">
                                {deviceCommandMeta.description}
                            </p>
                            <div className="text-[10px] text-slate-400 font-semibold">
                                {deviceCommandMeta.commandLabel} - UDP 8999
                            </div>
                            <pre className="bg-slate-900/70 border border-slate-800 rounded-lg p-2 font-mono text-[10px] text-emerald-200 whitespace-pre-wrap">
{DEVICE_COMMAND_PAYLOAD}
                            </pre>
                            <div className="text-[10px] text-slate-400 font-semibold">
                                {deviceCommandMeta.responseLabel}
                            </div>
                            <pre className="bg-slate-900/70 border border-slate-800 rounded-lg p-2 font-mono text-[10px] text-emerald-300 whitespace-pre-wrap">
{DEVICE_COMMAND_RESPONSE}
                            </pre>
                            <ul className="list-disc pl-4 space-y-1 text-[10px] text-slate-400">
                                <li>{deviceCommandMeta.noteChannelStart}</li>
                                <li>{deviceCommandMeta.noteIdNext}</li>
                                <li>{deviceCommandMeta.noteArr}</li>
                            </ul>
                        </div>
                    </div>
                </div>
              )}
            </div>

          </div>

           {/* Footer */}
          <div className="p-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between bg-slate-950/30 shrink-0">
             <span className="flex items-center gap-1"><Code size={10}/> Powered by Kidney</span>
             <span>V1.0.2</span>
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
                 
                 {/* Interface Selector Dropdown */}
                 {interfaces.length > 0 && (
                     <div className="flex items-center gap-2 bg-slate-800 rounded-md px-2 py-1 border border-slate-700">
                        <Network size={14} className="text-teal-400" />
                        <select 
                            value={selectedNic}
                            onChange={handleInterfaceChange}
                            className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer max-w-[150px]"
                            title={t.selectNic}
                        >
                            {interfaces.map(nic => (
                                <option key={nic.address} value={nic.address} className="bg-slate-900 text-slate-200">
                                    {nic.name} - {nic.address}
                                </option>
                            ))}
                        </select>
                     </div>
                 )}

                {/* Language Selector */}
                 <div className="flex items-center gap-2 bg-slate-800 rounded-md px-2 py-1 border border-slate-700">
                   <Languages size={14} className="text-slate-400" />
                   <select 
                       value={language}
                       onChange={(e) => setLanguage(e.target.value as keyof typeof TRANSLATIONS)}
                       className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer font-bold"
                   >
                       <option value="en">English</option>
                       <option value="zh">中文</option>
                       <option value="ja">日本語</option>
                       <option value="fr">Français</option>
                       <option value="de">Deutsch</option>
                       <option value="ko">한국어</option>
                       <option value="es">Español</option>
                       <option value="it">Italiano</option>
                   </select>
                 </div>
                 
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
