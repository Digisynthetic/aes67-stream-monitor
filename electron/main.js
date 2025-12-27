const { app, BrowserWindow } = require('electron');
const path = require('path');
const SapDiscovery = require('./services/SapDiscovery');

let mainWindow;
let sapService;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // ... load URL ...
}

app.whenReady().then(() => {
  createWindow();

  // Initialize SAP Discovery
  sapService = new SapDiscovery();
  
  // Forward updates to renderer
  sapService.on('update', (streams) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sap-update', streams);
    }
  });

  sapService.start();
});