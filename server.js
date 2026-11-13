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
    const response = await onRequest({ request, env, next: () => new Response(css, {
      headers: { 'Content-Type': 'text/css; charset=utf-8' },
    }) });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(400).end('Invalid request');
  }
}).listen(port, host, () => console.log(`Share the Cost: ${origin}`));
