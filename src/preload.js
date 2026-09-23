const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("transwords", {
  translate: (text) => ipcRenderer.invoke("translate", text),
  getHistory: () => ipcRenderer.invoke("history:get"),
  deleteHistoryItem: (id) => ipcRenderer.invoke("history:delete", id),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  readClipboard: () => ipcRenderer.invoke("clipboard:read"),
  copy: (text) => ipcRenderer.invoke("clipboard:write", text),
  openExternal: (url) => ipcRenderer.invoke("external:open", url),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  resetSettings: () => ipcRenderer.invoke("settings:reset"),
  onShortcut: (callback) => ipcRenderer.on("shortcut-translate", (_event, text) => callback(text))
});
