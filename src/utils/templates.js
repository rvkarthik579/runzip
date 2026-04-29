/**
 * Shared inline styles for server-rendered pages (share landing, error).
 * Uses the same design tokens as the main frontend.
 */
const BASE_STYLES = `
  :root {
    --bg: #fafafa;
    --surface: #ffffff;
    --border: #e5e7eb;
    --accent: #4f46e5;
    --accent-hover: #4338ca;
    --text: #18181b;
    --text-secondary: #52525b;
    --text-muted: #a1a1aa;
    --radius: 8px;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; }
  body {
    font-family: Inter, system-ui, -apple-system, sans-serif;
    font-size: 14px; line-height: 1.5;
    color: var(--text); background: var(--bg);
    -webkit-font-smoothing: antialiased;
  }
`;

export function renderHostedErrorPage(message) {
  const safeMessage = String(message || "Project not found.").replace(/[<>]/g, "");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RunZip — Project Unavailable</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>
      ${BASE_STYLES}
      .shell {
        max-width: 520px; margin: 80px auto;
        padding: 24px;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: var(--radius);
      }
      h1 { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
      p { color: var(--text-secondary); font-size: 14px; margin-bottom: 6px; }
      a { color: var(--accent); text-decoration: none; font-weight: 500; }
      a:hover { text-decoration: underline; }
    </style>
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-R0H94R9VCL"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-R0H94R9VCL');
    </script>
<meta name="google-site-verification" content="SMNmgMCubZBR08U5ePVbK0UtByf4PaGHoZ525HKxLqE" />
  </head>
  <body>
    <div class="shell">
      <h1>Project unavailable</h1>
      <p>${safeMessage}</p>
      <p><a href="/">← Back to RunZip</a></p>
    </div>
  </body>
</html>`;
}

export function renderShareLandingPage({ projectId, shareUrl, qrCodeDataUrl }) {
  const runtimeUrl = `/p/${projectId}/__runzip_project`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RunZip — Shared Project</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet" />
    <style>
      ${BASE_STYLES}
      .shell {
        max-width: 640px; margin: 0 auto;
        padding: 32px 16px 48px;
      }
      .brand {
        display: flex; align-items: center; gap: 8px;
        text-decoration: none; color: var(--text);
        font-weight: 700; font-size: 15px; margin-bottom: 24px;
      }
      .brand-mark {
        width: 28px; height: 28px; border-radius: 6px;
        background: var(--accent); color: #fff;
        display: grid; place-items: center;
        font-size: 12px; font-weight: 700;
      }
      .card {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: var(--radius); padding: 24px;
        text-align: center;
      }
      .card h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
      .card p { color: var(--text-secondary); font-size: 14px; margin-bottom: 16px; }
      .qr {
        width: 200px; max-width: 60vw; border-radius: 8px;
        border: 1px solid var(--border);
        background: #fff; padding: 6px;
      }
      .share-url {
        display: block; width: 100%; margin-top: 16px;
        padding: 8px 12px; border-radius: 6px;
        border: 1px solid var(--border); background: var(--bg);
        color: var(--text);
        font-family: "JetBrains Mono", monospace; font-size: 12px;
      }
      .open-btn {
        margin-top: 14px; border: none; border-radius: var(--radius);
        padding: 10px 20px; font-size: 14px; font-weight: 600;
        cursor: pointer; background: var(--accent); color: #fff;
        transition: background 0.15s;
      }
      .open-btn:hover { background: var(--accent-hover); }
      .open-btn:disabled { opacity: 0.5; cursor: default; }
      .viewer {
        display: none; margin-top: 16px;
        border: 1px solid var(--border); border-radius: var(--radius);
        overflow: hidden;
      }
      .viewer.show { display: block; }
      .viewer iframe {
        width: 100%; height: 70vh;
        border: none; background: #fff;
      }
      .badge {
        text-align: center; margin-top: 16px;
        font-size: 11px; color: var(--text-muted);
      }
    </style>
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-R0H94R9VCL"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-R0H94R9VCL');
    </script>
<meta name="google-site-verification" content="SMNmgMCubZBR08U5ePVbK0UtByf4PaGHoZ525HKxLqE" />
  </head>
  <body>
    <main class="shell">
      <a href="/" class="brand">
        <div class="brand-mark">R</div>
        RunZip
      </a>

      <div class="card">
        <h1>Shared with RunZip</h1>
        <p>Scan the QR code or open the project below.</p>
        <img class="qr" src="${qrCodeDataUrl}" alt="Share QR code" />
        <input class="share-url" type="text" readonly value="${shareUrl}" />
        <button id="openProjectBtn" class="open-btn">Open project</button>
      </div>

      <div id="viewer" class="viewer">
        <iframe id="projectFrame" title="Hosted project"></iframe>
      </div>

      <div class="badge">Shared via RunZip</div>
    </main>

    <script>
      const openBtn = document.getElementById("openProjectBtn");
      const viewer = document.getElementById("viewer");
      const frame = document.getElementById("projectFrame");
      const runtimeUrl = "${runtimeUrl}";

      openBtn.addEventListener("click", () => {
        viewer.classList.add("show");
        frame.src = runtimeUrl + "?t=" + Date.now();
        openBtn.textContent = "Project opened";
        openBtn.disabled = true;
      });
    </script>
  </body>
</html>`;
}

