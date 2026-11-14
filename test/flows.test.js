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
    supplier: 'https://supplier.example/shelving?variant=4&utm_source=share',
    description: 'Bulk shelving with local pickup.', target: '20', email: 'organizer@example.org',
  };
  assert.equal((await call('/admin')).status, 401);
  assert.equal((await call('/propose', { form: proposal, crossOrigin: true })).status, 403);
  assert.equal((await call('/propose', { form: { ...proposal, description: 'x'.repeat(50_000) } })).status, 413);
  assert.equal((await call('/propose', { form: { ...proposal, supplier: 'javascript:alert(1)' } })).status, 400);
  assert.equal((await call('/propose', { form: proposal })).status, 303);
  assert.equal((await call('/propose', { form: { ...proposal, supplier: 'https://supplier.example/shelving?variant=4#gallery' } })).status, 409);
  const queue = await (await call('/admin', { admin: true })).text();
  const slug = queue.match(/href="\/admin\/([^"]+)"/)[1];
  const path = '/buys/' + slug;
  assert.equal((await call(path)).status, 404);
  assert.equal((await call(path, { form: { email: 'buyer@example.org', quantity: '2' } })).status, 409);
  assert.ok(!(await (await call('/sitemap.xml')).text()).includes(path));
  assert.equal((await call('/admin/' + slug, { form: { action: 'approve' }, admin: true })).status, 303);
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
  assert.equal((await call(path, { form: { email: 'second@example.org', quantity: '3' } })).status, 303);
  const publicHtml = await (await call(path)).text();
  assert.match(publicHtml, /5 of 20/);
  assert.match(publicHtml, /\$20\.00 estimated shipping per unit/);
  assert.match(publicHtml, /Saturday in Glassell Park/);
  assert.match(publicHtml, /Waiting on a supplier quote/);
  assert.match(publicHtml, /never collects payments or card details/);
  assert.doesNotMatch(publicHtml, /@example\.org|utm_source/);
  assert.match(await (await call('/sitemap.xml')).text(), new RegExp(path));
  assert.equal((await call(management, { form: { quantity: '4' } })).status, 303);
  assert.match(await (await call(path)).text(), /7 of 20/);
  assert.match(await (await call(management)).text(), /noindex/);
  assert.equal((await call('/admin/' + slug, { form: { action: 'close' }, admin: true })).status, 303);
  assert.equal((await call(management, { form: { quantity: '1' } })).status, 409);
  assert.equal((await call(management, { form: { action: 'withdraw' } })).status, 303);
  assert.equal((await call(management)).status, 404);
  assert.equal((await call('/missing')).status, 404);
});
