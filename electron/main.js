import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import SapDiscovery from './services/SapDiscovery.js';
import AudioMonitor from './services/AudioMonitor.js';

// Manually define __filename and __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let sapService;
let audioMonitor;

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
  });

  // Smart URL loading:
  // 1. If configured via ENV, use that (e.g., specific dev setup)
  // 2. If not packaged (Development), try localhost:3000
  // 3. If packaged (Production), use the built index.html
  const isDev = !app.isPackaged;
  const startUrl = process.env.ELECTRON_START_URL || (isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, '../build/index.html')}`);

  console.log(`[Main] Loading URL: ${startUrl}`);
  mainWindow.loadURL(startUrl);

  // Open DevTools in development to help debugging
  if (isDev) {
    // mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();

  // Initialize Services
  sapService = new SapDiscovery();
  audioMonitor = new AudioMonitor();
  
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
    audioMonitor.setInterface(ip);
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

  // Start Discovery
  sapService.start();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // Stop audio service
  if (audioMonitor) audioMonitor.stopAll();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});