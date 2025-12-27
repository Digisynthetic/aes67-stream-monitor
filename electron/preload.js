const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Listen for SAP discovery updates
  onSapUpdate: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('sap-update', subscription);
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('sap-update', subscription);
    };
  }
});