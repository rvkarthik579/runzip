# RunZip

RunZip is a simple platform where users upload a ZIP containing a static web project
(HTML, CSS, JS), preview it instantly, and get a shareable link plus QR code to run the project on any device.

## What It Does

- Upload ZIP files up to 10MB
- Extract ZIP contents safely into `projects/{projectId}`
- Detect entry HTML using priority:
	`index.html` -> `dist/index.html` -> `build/index.html` -> `public/index.html` -> `src/index.html` -> first other `.html`
- Host the detected project at `/p/{projectId}`
- Show live preview with Desktop / Tablet / Mobile frame modes
- Open projects directly in a new tab via "Open Full Project"
- Generate QR code for the share link
- Run automatic cleanup: remove uploaded project folders older than 24 hours
- Keep legacy text project APIs available (`/api/projects`)

## Security

- ZIP path traversal is blocked during extraction
- Hosted files are served only from the `/projects` directory
- Upload size is limited to 10MB
- RunZip injects `<base href="./">` into HTML that has no `<base>` tag to improve relative asset loading

## Share URL and QR Behavior

- If `BASE_URL` is set, RunZip uses it for share links and QR codes.
- If `BASE_URL` is not set, RunZip uses the incoming request host.

Example:

`BASE_URL=http://192.168.1.42:4000`

This is recommended for phone testing on local network.

## API

### Health

`GET /api/health`

### Upload ZIP

`POST /api/uploads/zip`

Multipart form-data:

- `projectZip`: ZIP file (required, max 10MB)

Success response:

- `project.id`
- `project.shareUrl` (example: `http://localhost:4000/p/abc123`)
- `project.previewUrl`
- `qrCodeDataUrl`

### Hosted Project

`GET /p/:projectId`

Opens the uploaded project in browser.

### Friendly Upload Error

If no HTML file exists anywhere in the ZIP, RunZip returns:

`We couldn't find an index.html file in your project. Please upload a web project containing an index.html file.`

## Run Locally

```bash
npm install
npm start
```

Then open:

`http://localhost:4000`

RunZip listens on `0.0.0.0`, so devices on your LAN can open:

`http://<your-local-ip>:4000`

## Run As Desktop App (Electron)

RunZip can now launch as a native desktop window that automatically starts the Express backend in the background.

Install dependencies:

```bash
npm install
```

Start desktop app:

```bash
npm run desktop
```

This opens a native RunZip window and loads the app UI from the local backend.

## Build Installers

Build all targets configured in Electron Builder:

```bash
npm run dist
```

Build per platform:

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Output artifacts are written to the `release` folder.

Notes:

- `dist:win` creates an NSIS installer (`.exe`).
- `dist:mac` creates a DMG installer.
- `dist:linux` creates an AppImage.
- Building macOS installers is typically done on macOS.

## Environment

Copy `.env.example` to `.env` if needed:

```bash
PORT=4000
BASE_URL=http://localhost:4000
```

`BASE_URL` is optional. If not provided, share links use the incoming host.

## Legacy Endpoints (Still Available)

- `POST /api/projects`
- `GET /api/projects/:projectId?token=<shareToken>`
- `PUT /api/projects/:projectId?token=<shareToken>`
- `GET /api/share/:projectId/:shareToken`
