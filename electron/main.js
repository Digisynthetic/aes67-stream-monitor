import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import SapDiscovery from './services/SapDiscovery.js';
import AudioMonitor from './services/AudioMonitor.js';
import DeviceLevelPoller from './services/DeviceLevelPoller.js';

// Manually define __filename and __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let sapService;
let audioMonitor;
let devicePoller;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Often needed for local dev with local resources
      sandbox: false // <--- CRITICAL FIX: Required for ESM preload scripts to work in some environments
    },
    autoHideMenuBar: true,
    menuBarVisible: false,
  });

  // Smart URL loading:
  // 1. If configured via ENV, use that (e.g., specific dev setup)
  // 2. If not packaged (Development), try localhost:3000
  // 3. If packaged (Production), use the built index.html
  const isDev = !app.isPackaged;
  const startUrl = process.env.ELECTRON_START_URL || (isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, '../dist/index.html')}`);

  console.log(`[Main] Loading URL: ${startUrl}`);
  mainWindow.loadURL(startUrl);

  // Open DevTools in development to help debugging
  if (isDev || enableDevtools) {
    mainWindow.webContents.openDevTools();
  }
}

let logStream;
let logFilePath;

const enableDevtools = process.env.ELECTRON_ENABLE_DEVTOOLS === 'true';

function setupLogging() {
  const baseLogDir = app.isPackaged
    ? path.dirname(app.getPath('exe'))
    : app.getPath('userData');
  const logDir = path.join(baseLogDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  logFilePath = path.join(logDir, 'electron.log');
  logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

  const writeLog = (level, values) => {
    const payload = values
      .map((value) => (typeof value === 'string' ? value : JSON.stringify(value)))
      .join(' ');
    logStream.write(`[${new Date().toISOString()}] [${level}] ${payload}\n`);
  };

  ['log', 'info', 'warn', 'error'].forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...values) => {
      writeLog(level.toUpperCase(), values);
      original(...values);
    };
  });
  console.log(`Logging enabled; log file at ${logFilePath}`);
}

app.whenReady().then(() => {
  setupLogging();
  Menu.setApplicationMenu(null);
  createWindow();

  // Initialize Services
  sapService = new SapDiscovery();
  audioMonitor = new AudioMonitor();
  devicePoller = new DeviceLevelPoller();

  sapService.on('interface-changed', (ip) => {
    if (ip) {
      console.log(`[Main] SAP interface changed to: ${ip}`);
      if (audioMonitor) {
        audioMonitor.setInterface(ip);
      }
    }
  });
  
  devicePoller.on('levels', (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('device-levels', payload);
    }
  });

  devicePoller.on('error', (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('device-error', payload);
    }
  });

  // --- SAP Events ---
  sapService.on('update', (streams) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sap-update', streams);
    }
  });

  // --- Audio Events ---
  audioMonitor.on('levels', (levels) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio-levels', levels);
    }
  });

  // --- IPC Handlers ---

  // 1. Get/Set Interfaces
  ipcMain.handle('get-interfaces', async () => {
    return sapService.getInterfaces();
  });

  ipcMain.on('set-interface', (event, ip) => {
    console.log(`[Main] Switching interface to: ${ip}`);
    sapService.setInterface(ip);
  });

  // 2. Start/Stop Monitoring specific streams
  ipcMain.on('start-monitoring', (event, stream) => {
      if (stream && stream.id && stream.ip && stream.port) {
          audioMonitor.startMonitoring(stream.id, stream.ip, stream.port, stream.channels || 2);
      }
  });

  ipcMain.on('stop-monitoring', (event, streamId) => {
      audioMonitor.stopMonitoring(streamId);
  });

  ipcMain.on('start-device-monitoring', (event, stream) => {
    if (devicePoller) devicePoller.start(stream);
  });

  ipcMain.on('stop-device-monitoring', (event, streamId) => {
    if (devicePoller) devicePoller.stop(streamId);
  });

  // Start Discovery
  sapService.start();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // Stop audio service
  if (audioMonitor) audioMonitor.stopAll();
  if (devicePoller) devicePoller.stopAll();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (logStream) {
    logStream.end();
  }
});
