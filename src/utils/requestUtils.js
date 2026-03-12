import os from "node:os";

function firstLanIpv4Address() {
  const interfaces = os.networkInterfaces();

  for (const items of Object.values(interfaces)) {
    for (const item of items || []) {
      if (item && item.family === "IPv4" && !item.internal) {
        return item.address;
      }
    }
  }

  return null;
}

export function getBaseUrl(req) {
  const envBase = process.env.BASE_URL?.trim();
  if (envBase) {
    return envBase.replace(/\/$/, "");
  }

  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto ? forwardedProto.toString().split(",")[0].trim() : req.protocol;
  const host = (req.get("host") || "").trim();
  const localhostMatch = host.match(/^(localhost|127\.0\.0\.1)(:\d+)?$/i);

  if (!localhostMatch) {
    return `${protocol}://${host}`;
  }

  const lanIp = firstLanIpv4Address();
  if (!lanIp) {
    return `${protocol}://${host}`;
  }

  const port = localhostMatch[2] || "";
  return `${protocol}://${lanIp}${port}`;
}

export function readShareToken(req) {
  const token = req.query.token || req.headers["x-share-token"] || "";
  return token.toString().trim();
}
