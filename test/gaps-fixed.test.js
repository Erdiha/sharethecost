import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onRequest, supplierUrl } from '../functions/[[path]].js';
import { openDatabase } from '../local-db.js';

test('Gap 1: buy_updates workflow - organizer publishes shipping and pickup details', async t => {
  const DB = openDatabase();
  t.after(() => DB.close());
  const origin = 'http://127.0.0.1:8788';
  const env = { DB, LOCAL_DEV: '1', ADMIN_PASSWORD: 'test-password' };
  const auth = 'Basic ' + btoa('admin:test-password');

  function call(path, { form, admin = false } = {}) {
    const body = form && new URLSearchParams(form).toString();
    const headers = {
      ...(admin ? { Authorization: auth } : {}),
      ...(form ? {
        Origin: origin,
        'Content-Type': 'application/x-www-form-urlencoded',
      } : {}),
    };
    return onRequest({ request: new Request(origin + path, {
      headers, body, method: form ? 'POST' : 'GET',
    }), env });
  }

  const proposal = {
    title: 'Steel shelving', category: 'Tools & hardware', region: 'Los Angeles',
    supplier: 'https://supplier.example/shelving?variant=4',
    description: 'Bulk shelving with local pickup.', target: '20', email: 'organizer@example.org',
  };

  // Create and approve proposal
  await call('/propose', { form: proposal });
  const queue = await (await call('/admin', { admin: true })).text();
  const slugMatch = queue.match(/href="\/admin\/([^"]+)"/);
  assert.ok(slugMatch, 'Should find admin link in queue');
  const slug = slugMatch[1];
  await call(`/admin/${slug}`, { form: { action: 'approve' }, admin: true });

  // Add some participants
  await call(`/buys/${slug}`, { form: { email: 'buyer1@example.org', quantity: '5' } });
  await call(`/buys/${slug}`, { form: { email: 'buyer2@example.org', quantity: '3' } });

  // Publish shipping and pickup details
  const updateResponse = await call(`/admin/${slug}`, {
    form: { action: 'update', shipping: '45.99', pickup: 'Warehouse on Main St, Tues-Fri 2-6pm', note: 'Call ahead' },
    admin: true,
  });
  assert.equal(updateResponse.status, 303);

  // Verify details appear on public buy page
  const buyPage = await (await call(`/buys/${slug}`)).text();
  assert.match(buyPage, /45\.99/);
  assert.match(buyPage, /Warehouse on Main St/);
  assert.match(buyPage, /Tues-Fri 2-6pm/);
  assert.match(buyPage, /Call ahead/); // Current implementation shows organizer_note; this documents current behavior
  assert.match(buyPage, /estimated shipping per unit/i);
});

test('Gap 1: buy_updates with no shipping estimate shows pending', async t => {
  const DB = openDatabase();
  t.after(() => DB.close());
  const origin = 'http://127.0.0.1:8788';
  const env = { DB, LOCAL_DEV: '1', ADMIN_PASSWORD: 'test-password' };
  const auth = 'Basic ' + btoa('admin:test-password');

  function call(path, { form, admin = false } = {}) {
    const body = form && new URLSearchParams(form).toString();
    const headers = {
      ...(admin ? { Authorization: auth } : {}),
      ...(form ? { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    };
    return onRequest({ request: new Request(origin + path, { headers, body, method: form ? 'POST' : 'GET' }), env });
  }

  const proposal = {
    title: 'Tools', category: 'Tools & hardware', region: 'NYC',
    supplier: 'https://supplier.example/tools',
    description: 'Bulk tools order.', target: '10', email: 'org@example.org',
  };

  await call('/propose', { form: proposal });
  const queue = await (await call('/admin', { admin: true })).text();
  const slug = queue.match(/href="\/admin\/([^"]+)"/)[1];
  await call(`/admin/${slug}`, { form: { action: 'approve' }, admin: true });

  const buyPage = await (await call(`/buys/${slug}`)).text();
  assert.match(buyPage, /Shipping estimate pending/i);
  assert.match(buyPage, /Pickup details pending/i);
});

test('Gap 2: Email case-insensitivity prevents duplicate registrations', async t => {
  const DB = openDatabase();
  t.after(() => DB.close());
  const origin = 'http://127.0.0.1:8788';
  const env = { DB, LOCAL_DEV: '1', ADMIN_PASSWORD: 'test-password' };
  const auth = 'Basic ' + btoa('admin:test-password');

  function call(path, { form, admin = false } = {}) {
    const body = form && new URLSearchParams(form).toString();
    return onRequest({ request: new Request(origin + path, {
      headers: {
        ...(admin ? { Authorization: auth } : {}),
        ...(form ? { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body,
      method: form ? 'POST' : 'GET',
    }), env });
  }

  const proposal = {
    title: 'Widgets', category: 'Electronics', region: 'Boston',
    supplier: 'https://supplier.example/widgets-case-test',
    description: 'Bulk widgets.', target: '15', email: 'org@example.org',
  };

  const propRes = await call('/propose', { form: proposal });
  assert.equal(propRes.status, 303);

  const queueRes = await call('/admin', { admin: true });
  const queueText = await queueRes.text();
  const slugMatch = queueText.match(/href="\/admin\/([^"]+)"/);
  assert.ok(slugMatch, 'Should find proposal in admin queue');
  const slug = slugMatch[1];

  const approveRes = await call(`/admin/${slug}`, { form: { action: 'approve' }, admin: true });
  assert.equal(approveRes.status, 303);

  // Try to join with different email case variants
  const email1 = await call(`/buys/${slug}`, { form: { email: 'BUYER@example.org', quantity: '2' } });
  assert.equal(email1.status, 303);

  const email2 = await call(`/buys/${slug}`, { form: { email: 'buyer@example.org', quantity: '3' } });
  assert.equal(email2.status, 409, 'Second registration with lowercase email should conflict');

  const email3 = await call(`/buys/${slug}`, { form: { email: 'Buyer@Example.Org', quantity: '1' } });
  assert.equal(email3.status, 409, 'Third registration with mixed-case email should conflict');

  // Verify only one interest exists in DB
  const count = await DB.prepare('SELECT COUNT(*) as count FROM interests WHERE slug=?')
    .bind(slug).first();
  assert.equal(count.count, 1);

  // Verify it's stored as lowercase
  const stored = await DB.prepare('SELECT email FROM interests WHERE slug=?')
    .bind(slug).first();
  assert.equal(stored.email, 'buyer@example.org');
});

test('Gap 2: Concurrent joins with case variants result in exactly one success', async t => {
  const DB = openDatabase();
  t.after(() => DB.close());
  const origin = 'http://127.0.0.1:8788';
  const env = { DB, LOCAL_DEV: '1', ADMIN_PASSWORD: 'test-password' };
  const auth = 'Basic ' + btoa('admin:test-password');

  function call(path, { form, admin = false } = {}) {
    const body = form && new URLSearchParams(form).toString();
    return onRequest({ request: new Request(origin + path, {
      headers: {
        ...(admin ? { Authorization: auth } : {}),
        ...(form ? { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body,
      method: form ? 'POST' : 'GET',
    }), env });
  }

  const proposal = {
    title: 'Supplies', category: 'Other', region: 'Denver',
    supplier: 'https://supplier.example/supplies-concurrent-test',
    description: 'Bulk supplies.', target: '20', email: 'org@example.org',
  };

  const propRes = await call('/propose', { form: proposal });
  assert.equal(propRes.status, 303);

  const queueRes = await call('/admin', { admin: true });
  const queueText = await queueRes.text();
  const slugMatch = queueText.match(/href="\/admin\/([^"]+)"/);
  assert.ok(slugMatch, 'Should find proposal in admin queue');
  const slug = slugMatch[1];

  const approveRes = await call(`/admin/${slug}`, { form: { action: 'approve' }, admin: true });
  assert.equal(approveRes.status, 303);

  // Simulate concurrent requests with case variants
  const results = await Promise.all([
    call(`/buys/${slug}`, { form: { email: 'CONCURRENT@example.org', quantity: '1' } }),
    call(`/buys/${slug}`, { form: { email: 'concurrent@example.org', quantity: '2' } }),
    call(`/buys/${slug}`, { form: { email: 'Concurrent@Example.Org', quantity: '3' } }),
  ]);

  const statuses = results.map(r => r.status).sort();
  assert.deepEqual(statuses, [303, 409, 409], 'One should succeed (303), two should conflict (409)');

  const count = await DB.prepare('SELECT COUNT(*) as count FROM interests WHERE slug=?')
    .bind(slug).first();
  assert.equal(count.count, 1, 'Only one interest should be recorded');
});

test('Gap 3: Supplier URL validation rejects private IPs and localhost', t => {
  const badUrls = [
    'https://127.0.0.1/admin',
    'https://127.0.0.2/products',
    'https://0.0.0.0/exploit',
    'https://localhost/admin',
    'https://192.168.1.1/internal',
    'https://172.16.0.1/network',
    'https://10.0.0.1/private',
    'https://[::1]/admin',
    'https://[fc00::1]/link-local',
  ];

  for (const url of badUrls) {
    assert.equal(supplierUrl(url), null, `Should reject ${url}`);
  }
});

test('Gap 3: Supplier URL validation accepts valid public URLs', t => {
  const goodUrls = [
    'https://amazon.com/products',
    'https://shop.example.com/item',
    'https://vendor.co.uk/bulk',
  ];

  for (const url of goodUrls) {
    assert.ok(supplierUrl(url), `Should accept ${url}`);
  }
});

test('Gap 3: Supplier URL validation removes tracking parameters', t => {
  const url = 'https://example.com/product?utm_source=test&utm_campaign=sale&fbclid=abc123&gclid=xyz789#gallery';
  const result = supplierUrl(url);
  assert.ok(result);
  assert.doesNotMatch(result, /utm_source/);
  assert.doesNotMatch(result, /fbclid/);
  assert.doesNotMatch(result, /gclid/);
  assert.doesNotMatch(result, /#gallery/);
  assert.match(result, /^https:\/\/example\.com\/product/);
});

test('Gap 3: Supplier URL validation rejects non-HTTPS', t => {
  assert.equal(supplierUrl('http://example.com/product'), null);
  assert.equal(supplierUrl('ftp://example.com/product'), null);
});

test('Gap 3: Supplier URL validation rejects userinfo (credentials)', t => {
  assert.equal(supplierUrl('https://user:pass@example.com/product'), null);
  assert.equal(supplierUrl('https://admin:password@supplier.com/items'), null);
});

test('Gap 3: XSS payloads in description are escaped in admin view', async t => {
  const DB = openDatabase();
  t.after(() => DB.close());
  const origin = 'http://127.0.0.1:8788';
  const env = { DB, LOCAL_DEV: '1', ADMIN_PASSWORD: 'test-password' };
  const auth = 'Basic ' + btoa('admin:test-password');

  function call(path, { form, admin = false } = {}) {
    const body = form && new URLSearchParams(form).toString();
    return onRequest({ request: new Request(origin + path, {
      headers: {
        ...(admin ? { Authorization: auth } : {}),
        ...(form ? { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body,
      method: form ? 'POST' : 'GET',
    }), env });
  }

  const xssProposal = {
    title: 'XSS Test', category: 'Other', region: 'Test City',
    supplier: 'https://supplier.example/test',
    description: '<img src=x onerror="alert(1)"> Click here for details',
    target: '5', email: 'org@example.org',
  };

  await call('/propose', { form: xssProposal });
  const queue = await (await call('/admin', { admin: true })).text();
  const slug = queue.match(/href="\/admin\/([^"]+)"/)[1];

  const adminPage = await (await call(`/admin/${slug}`, { admin: true })).text();
  assert.doesNotMatch(adminPage, /<img\s+src=/);
  assert.match(adminPage, /&lt;img/);
});
