import { contextBridge, ipcRenderer } from 'electron';

console.log('[Preload] Script loaded successfully. API should be available.');

contextBridge.exposeInMainWorld('api', {
  // Listen for SAP discovery updates
  onSapUpdate: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('sap-update', subscription);
    return () => ipcRenderer.removeListener('sap-update', subscription);
  },
  
  // Interface Management
  getInterfaces: () => ipcRenderer.invoke('get-interfaces'),
  setInterface: (ip) => ipcRenderer.send('set-interface', ip),

  // Audio Monitoring Control
  startMonitoring: (stream) => ipcRenderer.send('start-monitoring', stream),
  stopMonitoring: (streamId) => ipcRenderer.send('stop-monitoring', streamId),
  
  // Listen for real-time audio levels
  onAudioLevels: (callback) => {
      const subscription = (event, levels) => callback(levels);
      ipcRenderer.on('audio-levels', subscription);
      return () => ipcRenderer.removeListener('audio-levels', subscription);
  }
});