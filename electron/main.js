import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.PORT || 4000);
const HOST = "127.0.0.1";
const SERVER_URL = `http://${HOST}:${PORT}`;

let mainWindow = null;

async function startBackendServer() {
  try {
    process.env.PORT = String(PORT);
    const serverModulePath = path.join(app.getAppPath(), "src", "server.js");
    const serverModuleUrl = pathToFileURL(serverModulePath).href;
    await import(serverModuleUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("RunZip failed to start", `Backend failed to boot:\n${message}`);
    throw error;
  }
}

async function waitForServer(timeoutMs = 20000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${SERVER_URL}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server still booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error("Timed out waiting for backend server to become ready.");
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 700,
    autoHideMenuBar: true,
    title: "RunZip",
    backgroundColor: "#f2efe7"
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function bootDesktopApp() {
  await startBackendServer();
  await waitForServer();
  createMainWindow();
}

app.whenReady().then(() => {
  bootDesktopApp().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("RunZip startup error", message);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
