import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { onRequest } from './functions/[[path]].js';
import { openDatabase } from './local-db.js';

const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 8788);
const origin = `http://${host}:${port}`;
const DB = openDatabase(new URL('./sharethecost.sqlite', import.meta.url).pathname);
const env = { DB, LOCAL_DEV: '1', ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? 'local-preview' };
const css = readFileSync(new URL('./dist/style.css', import.meta.url));
createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(origin + incoming.url, {
      method: incoming.method, headers: incoming.headers,
      ...(incoming.method === 'POST' ? { body: incoming, duplex: 'half' } : {}),
    });
    const pathname = new URL(request.url).pathname;
    const response = await onRequest({ request, env, next: () => {
      if (pathname === '/style.css') return new Response(css, {
        headers: { 'Content-Type': 'text/css; charset=utf-8' },
      });
      const asset = pathname.match(/^\/assets\/([a-z-]+\.(woff2|jpg|png|js))$/);
      if (!asset) return new Response(null, { status: 404 });
      const data = readFileSync(new URL(`./dist/assets/${asset[1]}`, import.meta.url), { throwIfNoEntry: false });
      return data ? new Response(data, {
        headers: { 'Content-Type': { woff2: 'font/woff2', jpg: 'image/jpeg', png: 'image/png', js: 'text/javascript; charset=utf-8' }[asset[2]] },
      }) : new Response(null, { status: 404 });
    } });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(400).end('Invalid request');
  }
}).listen(port, host, () => console.log(`Share the Cost: ${origin}`));
