import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onRequest } from '../functions/[[path]].js';
import { openDatabase } from '../local-db.js';

test('production forms explain missing Turnstile configuration and reject submissions', async t => {
  const DB = openDatabase();
  t.after(() => DB.close());
  const origin = 'https://sharethecost.whenly.org';
  const env = { DB };

  const formPage = await onRequest({ request: new Request(origin + '/propose'), env });
  const html = await formPage.text();
  assert.match(html, /Online verification is temporarily unavailable/);
  assert.doesNotMatch(html, /data-sitekey=""/);

  const form = new URLSearchParams({
    title: 'Steel shelving', category: 'Tools & hardware', region: 'Los Angeles',
    supplier: 'https://supplier.example/shelving', description: 'Bulk shelving with local pickup.',
    target: '20', email: 'organizer@example.org',
  });
  const response = await onRequest({ request: new Request(origin + '/propose', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  }), env });

  assert.equal(response.status, 503);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM buys').first()).count, 0);
});

test('browser verification errors redirect to a reloadable form', async t => {
  const DB = openDatabase();
  t.after(() => DB.close());
  const origin = 'https://sharethecost.whenly.org';
  const env = { DB, TURNSTILE_SITE_KEY: 'test-site-key', TURNSTILE_SECRET: 'test-secret' };
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Siteverify timeout'); });
  const request = new Request(origin + '/propose', {
    method: 'POST', headers: { Origin: origin, Accept: 'text/html' },
    body: new URLSearchParams({ 'cf-turnstile-response': 'test-token', email: 'private@example.com' }),
  });
  const response = await onRequest({ request, env });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('Location'), '/propose?verification=503');
  const retry = await onRequest({ request: new Request(origin + response.headers.get('Location')), env });
  assert.match(await retry.text(), /role="alert">Verification is temporarily unavailable/);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM buys').first()).count, 0);
});

test('production submissions reject mismatched actions, replay and bursts', async t => {
  const DB = openDatabase();
  t.after(() => DB.close());
  const origin = 'https://sharethecost.whenly.org';
  const env = { DB, TURNSTILE_SITE_KEY: 'test-site-key', TURNSTILE_SECRET: 'test-secret' };
  let action = 'join';
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    assert.equal(request.body.get('remoteip'), '192.0.2.1');
    return Response.json({ success: true, hostname: 'sharethecost.whenly.org', action });
  });
  const call = (token, number) => onRequest({
    request: new Request(origin + '/propose', {
      method: 'POST', headers: { Origin: origin, 'CF-Connecting-IP': '192.0.2.1' },
      body: new URLSearchParams({
        title: 'Steel shelving', category: 'Tools & hardware', region: 'Los Angeles',
        supplier: 'https://supplier.example/shelving/' + number, description: 'Bulk shelving with local pickup.',
        target: '20', email: 'organizer@example.org', 'cf-turnstile-response': token,
      }),
    }),
    env,
  });
  assert.equal((await call('test-token-0', 0)).status, 403);
  action = 'propose';
  assert.equal((await call('test-token-0', 0)).status, 303);
  assert.equal((await call('test-token-0', 1)).status, 429);
  const burst = await Promise.all(Array.from({ length: 12 }, (_, index) => call(`test-token-${index + 1}`, index + 1)));
  assert.equal(burst.filter(response => response.status === 303).length, 11);
  assert.equal(burst.filter(response => response.status === 429).length, 1);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM buys').first()).count, 12);
  await DB.prepare('UPDATE submission_checks SET expires_at=unixepoch()-1').run();
  assert.equal((await call('fresh-token', 13)).status, 303);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM submission_checks').first()).count, 1);
});

test('group buys persist through proposal, moderation, independent joins, updates and closure', async t => {
  const DB = openDatabase();
  t.after(() => DB.close());
  const origin = 'http://127.0.0.1:8788';
  const env = { DB, LOCAL_DEV: '1', ADMIN_PASSWORD: 'test-password' };
  const auth = 'Basic ' + btoa('admin:test-password');
  function call(path, { form, admin = false, crossOrigin = false } = {}) {
    const body = form && new URLSearchParams(form).toString();
    const headers = {
      ...(admin ? { Authorization: auth } : {}),
      ...(form ? {
        Origin: crossOrigin ? 'https://example.org' : origin,
        'Content-Type': 'application/x-www-form-urlencoded',
      } : {}),
    };
    return onRequest({ request: new Request(origin + path, {
      headers, body, method: form ? 'POST' : 'GET',
    }), env });
  }

  const proposal = {
    title: 'Steel shelving', category: 'Tools & hardware', region: 'Los Angeles',
    supplier: 'https://supplier.example/shelving?variant=4&signature=z%20y#gallery',
    description: 'Bulk shelving with local pickup.', target: '20', email: 'organizer@example.org',
  };
  assert.equal((await call('/admin')).status, 401);
  assert.equal((await call('/propose', { form: proposal, crossOrigin: true })).status, 403);
  assert.equal((await call('/propose', { form: { ...proposal, description: 'x'.repeat(50_000) } })).status, 413);
  assert.equal((await call('/propose', { form: { ...proposal, supplier: 'javascript:alert(1)' } })).status, 400);
  assert.equal((await call('/propose', { form: proposal })).status, 303);
  assert.equal((await call('/propose', { form: { ...proposal, supplier: 'https://supplier.example/shelving?signature=z+y&variant=4#details' } })).status, 409);
  const queue = await (await call('/admin', { admin: true })).text();
  const slug = queue.match(/href="\/admin\/([^"]+)"/)[1];
  const path = '/buys/' + slug;
  const supplierHref = 'https://supplier.example/shelving?variant=4&amp;signature=z%20y#gallery';
  assert.ok((await (await call('/admin/' + slug, { admin: true })).text()).includes(supplierHref));
  const ancestors = 'frame-ancestors https://whenly.org https://www.whenly.org https://whenly-theta.vercel.app';
  for (const route of ['/', '/propose', '/privacy', '/terms', path]) {
    const page = await call(route);
    assert.ok(page.headers.get('Content-Security-Policy').endsWith(ancestors));
    assert.equal(page.headers.get('X-Frame-Options'), null);
  }
  for (const route of ['/admin', '/interest/' + 'a'.repeat(72)]) {
    const page = await call(route);
    assert.ok(page.headers.get('Content-Security-Policy').endsWith("frame-ancestors 'none'"));
    assert.equal(page.headers.get('X-Frame-Options'), 'DENY');
  }

  assert.equal((await call(path)).status, 404);
  assert.equal((await call(path, { form: { email: 'buyer@example.org', quantity: '2' } })).status, 409);
  assert.ok(!(await (await call('/sitemap.xml')).text()).includes(path));
  assert.equal((await call('/admin/' + slug, { form: { action: 'approve' }, admin: true })).status, 303);
  const embed = await onRequest({ request: new Request(origin + path, {
    headers: { 'Sec-Fetch-Dest': 'iframe' },
  }), env });
  assert.match(await embed.text(), /<form method="post" class="stack" target="_blank" rel="noopener">/);
  assert.doesNotMatch(await (await call(path)).text(), /<form[^>]*target="_blank"/);

  const update = { action: 'update', shipping: '400.00', pickup: 'Saturday in Glassell Park', note: 'Waiting on a supplier quote.' };
  assert.equal((await call('/admin/' + slug, { form: update })).status, 401);
  assert.equal((await call('/admin/' + slug, { form: { ...update, shipping: '-10' }, admin: true })).status, 400);
  assert.equal((await call('/admin/' + slug, { form: update, admin: true })).status, 303);
  assert.match(await (await call('/?q=shelving')).text(), /Steel shelving/);
  assert.doesNotMatch(await (await call('/?q=unrelated')).text(), /Steel shelving/);
  const first = { email: 'BUYER@example.org', quantity: '2' };
  const competing = await Promise.all([
    call(path, { form: first }),
    call(path, { form: { ...first, email: first.email.toLowerCase() } }),
  ]);
  assert.deepEqual(competing.map(res => res.status).sort(), [303, 409]);
  const management = competing.find(res => res.status === 303).headers.get('Location');
  const second = await call(path, { form: { email: 'second@example.org', quantity: '3' } });
  assert.equal(second.status, 303);
  const secondManagement = second.headers.get('Location');
  const publicHtml = await (await call(path)).text();
  assert.match(publicHtml, /5 of 20/);
  assert.match(publicHtml, /\$20\.00 estimated shipping per unit/);
  assert.match(publicHtml, /Saturday in Glassell Park/);
  assert.match(publicHtml, /Waiting on a supplier quote/);
  assert.match(publicHtml, /never collects payments or card details/);
  assert.doesNotMatch(publicHtml, /@example\.org/);
  assert.ok(publicHtml.includes(supplierHref));
  assert.match(await (await call('/sitemap.xml')).text(), new RegExp(path));
  assert.equal((await call(management, { form: { quantity: '4' } })).status, 303);
  assert.match(await (await call(path)).text(), /7 of 20/);
  const managementPage = await call(management);
  assert.equal(managementPage.status, 200);
  assert.match(await managementPage.text(), /Update quantity/);
  assert.equal((await call('/admin/' + slug, { form: { action: 'close' }, admin: true })).status, 303);
  assert.equal((await call(management, { form: { quantity: '1' } })).status, 409);
  assert.equal((await call(management, { form: { action: 'withdraw' } })).status, 303);
  assert.equal((await call(management)).status, 404);
  assert.equal((await call('/admin/' + slug, { form: { action: 'remove' } })).status, 401);
  assert.equal((await call('/admin/' + slug, { form: { action: 'remove' }, admin: true })).status, 303);
  assert.equal((await call(path)).status, 404);
  assert.doesNotMatch(await (await call('/sitemap.xml')).text(), new RegExp(path));
  assert.match(await (await call(secondManagement)).text(), /This listing has been removed/);
  const withdrawal = await call(secondManagement, { form: { action: 'withdraw' } });
  assert.equal(withdrawal.status, 303);
  assert.equal(withdrawal.headers.get('Location'), '/');
  assert.equal((await call('/missing')).status, 404);
});
