// "Open on your phone": the page on a phone on the same Wi-Fi. Off by default. When on, the server
// also listens on this computer's own private Wi-Fi/LAN addresses (one extra listener per address,
// so turning it on or off needs no restart and 127.0.0.1 never changes). A phone gets in only with
// the token from the QR code; it is kept in an HttpOnly cookie.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import type express from 'express';

export type LanSettings = { enabled: boolean; token: string };
export const LAN_COOKIE = 'klipownia_lan';
const COOKIE_DAYS = 30;

const readSettings = (file: string): Record<string, unknown> => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
};
const newToken = () => crypto.randomBytes(18).toString('base64url');

export const plainIp = (ip: string | undefined) => (ip ?? '').replace(/^::ffff:/, '');
export const isLoopback = (ip: string) => ip === '::1' || /^127\./.test(ip);
// Only home and office networks: 10.x, 172.16-31.x, 192.168.x.
export const isPrivateV4 = (ip: string) => {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
};
// The phone usually sees 192.168.x first (home Wi-Fi); 172.x is often a virtual adapter.
const rank = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
/** This computer's private IPv4 addresses, best first. */
export const lanIps = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((a): a is os.NetworkInterfaceInfo => !!a && a.family === 'IPv4' && !a.internal && isPrivateV4(a.address))
    .map((a) => a.address)
    .filter((ip, i, all) => all.indexOf(ip) === i)
    .sort((a, b) => rank(a) - rank(b));
export const ownIps = () =>
  new Set(
    Object.values(os.networkInterfaces())
      .flat()
      .filter((a): a is os.NetworkInterfaceInfo => !!a)
      .map((a) => plainIp(a.address)),
  );

export const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};
export const cookieOf = (req: express.Request, name: string) => {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
};
export const lanCookie = (token: string) => `${LAN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_DAYS * 86400}`;

export const SCAN_PAGE = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Klipownia</title>
<style>body{font:17px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:48px 24px;background:#f6f3ee;color:#151515;text-align:center}h1{font-size:22px;margin:0 0 8px}p{margin:0;color:#555}</style></head>
<body><h1>Zeskanuj kod QR w Klipowni na komputerze</h1><p>Scan the QR code in Klipownia on your computer.</p></body></html>`;

export function makeLan(opts: { settingsFile: string; port: number; app: express.Express }) {
  const read = (): LanSettings => {
    const l = readSettings(opts.settingsFile).lan as Partial<LanSettings> | undefined;
    return { enabled: l?.enabled === true, token: typeof l?.token === 'string' && l.token.length >= 16 ? l.token : '' };
  };
  let state = read();
  const write = (s: LanSettings) => {
    const tmp = opts.settingsFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ ...readSettings(opts.settingsFile), lan: s }, null, 2));
    fs.renameSync(tmp, opts.settingsFile);
    state = s;
  };

  // One listener per LAN address while the switch is on. Addresses can change (new Wi-Fi, DHCP),
  // so this runs again on every settings look and every 30 s.
  const servers = new Map<string, http.Server>();
  const failed = new Map<string, string>();
  let ips: string[] = [];
  const reconcile = () => {
    ips = state.enabled ? lanIps() : [];
    for (const [ip, s] of servers)
      if (!ips.includes(ip)) {
        s.close();
        s.closeAllConnections?.();
        servers.delete(ip);
      }
    for (const ip of ips) {
      if (servers.has(ip)) continue;
      const s = http.createServer(opts.app);
      servers.set(ip, s);
      s.on('error', (e: NodeJS.ErrnoException) => {
        console.error(`phone listener ${ip}:${opts.port}:`, e.code ?? e.message);
        failed.set(ip, e.code ?? e.message);
        servers.delete(ip);
      });
      s.listen(opts.port, ip, () => {
        failed.delete(ip);
        console.log(`Klipownia for the phone: http://${ip}:${opts.port}`);
      });
    }
  };
  setInterval(() => state.enabled && reconcile(), 30_000).unref();

  return {
    get: () => state,
    ips: () => ips,
    failed: () => [...failed.entries()].filter(([ip]) => ips.includes(ip)).map(([ip, code]) => ({ ip, code })),
    hosts: () => (state.enabled ? ips.map((ip) => `${ip}:${opts.port}`) : []),
    reconcile,
    setEnabled: (enabled: boolean) => {
      write({ enabled, token: state.token || newToken() });
      reconcile();
    },
    rotate: () => {
      write({ ...state, token: newToken() });
    },
    close: () => {
      for (const s of servers.values()) {
        s.close();
        s.closeAllConnections?.();
      }
      servers.clear();
    },
    start: () => {
      if (state.enabled && !state.token) write({ ...state, token: newToken() });
      reconcile();
    },
  };
}
