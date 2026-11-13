const categories = ['Home & garden', 'Tools & hardware', 'Electronics', 'Sports & outdoors', 'Other'];
const canonical = 'https://sharethecost.whenly.org';
const paymentNotice = 'Share the Cost never collects payments or card details. Buyers arrange payment directly with the supplier or organizer.';
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const escape = (value = '') => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const content = (text, type, status = 200) => new Response(text, {
  status,
  headers: {
    'Content-Type': type, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  },
});
function page(title, body, { status = 200, path, description = 'Find people nearby who want the same product and build a bulk order together.' } = {}) {
  return content(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} | Share the Cost</title><meta name="description" content="${escape(description)}">
${path ? `<link rel="canonical" href="${canonical}${escape(path)}">` : '<meta name="robots" content="noindex">'}
<link rel="stylesheet" href="/style.css"></head><body>
<header><nav class="wrap"><a class="brand" href="/"><span aria-hidden="true">↗</span> Share the Cost</a><a class="button quiet" href="/propose">Propose a buy</a></nav></header>
<main>${body}</main><footer class="wrap"><span>${paymentNotice}</span><a href="/#how">How it works</a></footer></body></html>`, 'text/html; charset=utf-8', status);
}
const section = body => `<section class="wrap narrow">${body}</section>`;
const errorPage = (status, message) => page('Something went wrong', section(`<h1>${escape(message)}</h1><a href="/">Back to group buys</a>`), { status });
const redirect = path => new Response(null, { status: 303, headers: { Location: path, 'Referrer-Policy': 'no-referrer' } });
const field = (form, key) => String(form.get(key) ?? '').trim();
const maxFormBytes = 48 * 1024;

async function readForm(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return new URLSearchParams(body + decoder.decode());
      size += value.byteLength;
      if (size > maxFormBytes) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}
function integer(form, key, min, max) {
  const value = field(form, key);
  const number = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}
function emailFrom(form) {
  const value = field(form, 'email').toLowerCase().trim();
  return value.length > 0 && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}
export function supplierUrl(value) {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) return null;
    
    // Reject private/reserved IPs and localhost
    if (/^(localhost|127\.|0\.|::1|fc00:|fd00:|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname)) {
      return null;
    }
    
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch {
    return null;
  }
}
async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
const dev = (url, env) => env.LOCAL_DEV === '1' && ['127.0.0.1', 'localhost'].includes(url.hostname);
function captcha(url, env) {
  if (dev(url, env)) return '';
  return `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<div class="cf-turnstile" data-sitekey="${escape(env.TURNSTILE_SITE_KEY ?? '')}"></div>`;
}
async function verified(form, url, env) {
  if (dev(url, env)) return true;
  const token = field(form, 'cf-turnstile-response');
  if (!env.TURNSTILE_SECRET || !token || token.length > 2048) return false;
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token }),
  });
  const result = await response.json();
  return result.success === true && result.hostname === url.hostname;
}
function adminAllowed(request, env) {
  const auth = request.headers.get('Authorization') ?? '';
  if (!env.ADMIN_PASSWORD || !auth.startsWith('Basic ')) return false;
  try { return atob(auth.slice(6)) === `admin:${env.ADMIN_PASSWORD}`; } catch { return false; }
}
function adminChallenge() {
  return new Response('Organizer login required', { status: 401, headers: {
    'WWW-Authenticate': 'Basic realm="Share the Cost organizer"', 'Cache-Control': 'no-store',
  } });
}
const listing = `SELECT b.slug,b.title,b.category,b.region,b.description,b.target,b.supplier,b.status,
  (SELECT COALESCE(SUM(quantity),0) FROM interests i WHERE i.slug=b.slug) AS quantity FROM buys b`;
function card(buy) {
  return `<article class="card"><div class="tag">${escape(buy.category)}</div>
<h2><a href="/buys/${escape(buy.slug)}">${escape(buy.title)}</a></h2><p>${escape(buy.region)}</p>
<progress value="${buy.quantity}" max="${buy.target}" aria-label="Interest toward the minimum"></progress>
<p>${buy.quantity} of ${buy.target} units requested</p></article>`;
}
async function home(url, db) {
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  const category = url.searchParams.get('category') ?? '';
  const { results } = await db.prepare(`${listing} WHERE b.status='open'
    AND (?='' OR instr(lower(b.title||' '||b.region),lower(?))>0)
    AND (?='' OR b.category=?) ORDER BY b.created_at DESC,b.slug LIMIT 60`)
    .bind(query, query, category, category).all();
  return page('Local group buying', `<section class="hero"><div class="wrap hero-inner">
<div><h1>Buy together.<br><em>Share the cost.</em></h1><p>Find people nearby who want the same product. Combine quantities to reach a supplier’s bulk minimum and share the shipping cost.</p><p>${paymentNotice}</p>
<div class="actions"><a class="button" href="#browse">Browse group buys</a><a class="button quiet" href="/propose">Propose a buy</a></div></div>
<aside><p class="tag">How the math works</p><strong>$20 shipping per unit</strong><p>Example: 20 units share one $400 shipment. Product cost and other charges are separate.</p></aside>
</div></section><section class="wrap block" id="browse"><h2>Open group buys</h2>
<form class="filters" action="/#browse"><label>Search products or pickup areas<input name="q" value="${escape(query)}" placeholder="e.g. shelving or Los Angeles"></label>
<label>Category<select name="category"><option value="">All categories</option>${categories.map(item => `<option${item === category ? ' selected' : ''}>${escape(item)}</option>`).join('')}</select></label><button>Search</button></form>
<div class="cards">${results.map(card).join('') || '<p>No matching group buys. <a href="/propose">Propose a product</a>.</p>'}</div></section>
<section class="wrap block" id="how"><h2>How it works</h2><div class="cards">
<article><h3>Suggest a product</h3><p>Share a supplier link, pickup area, and the minimum order quantity.</p></article>
<article><h3>Build the group</h3><p>Buyers register how many units they want. They can withdraw anytime.</p></article>
<article><h3>Coordinate the order</h3><p>The organizer confirms the quote and pickup details. Buyers arrange payment separately.</p></article></div></section>`, { path: '/' });
}
function propose(url, env) {
  return page('Propose a group buy', section(`<h1>Propose a group buy</h1><p>Approved proposals appear on the site. Your email stays private and is available to the organizer for coordination.</p><p>${paymentNotice}</p>
<form method="post" class="stack">
<label>Product name<input name="title" required minlength="3" maxlength="100"></label>
<label>Category<select name="category" required>${categories.map(item => `<option>${escape(item)}</option>`).join('')}</select></label>
<label>Pickup area<input name="region" required minlength="2" maxlength="80" placeholder="City, state"></label>
<label>Supplier URL<input type="url" name="supplier" required maxlength="2048"></label>
<label>Minimum order quantity<input type="number" name="target" required min="2" max="100000"></label>
<label>Product and shipping details<textarea name="description" required minlength="10" maxlength="2000"></textarea></label>
<label>Email<input type="email" name="email" required maxlength="254"></label>
${captcha(url, env)}<button>Submit for review</button></form>`));
}
async function buyPage(url, env, slug) {
  const buy = await env.DB.prepare(`${listing} WHERE b.slug=? AND b.status IN ('open','closed')`).bind(slug).first();
  if (!buy) return errorPage(404, 'Group buy not found.');
  const update = await env.DB.prepare('SELECT * FROM buy_updates WHERE slug=?').bind(slug).first();
  const shipping = update?.shipping_cents;
  return page(buy.title, section(`<a href="/#browse">← All group buys</a><p class="tag">${escape(buy.category)}</p><h1>${escape(buy.title)}</h1>
<p>Pickup area: ${escape(buy.region)}</p><p class="details">${escape(buy.description)}</p>
<p><a href="${escape(buy.supplier)}" rel="nofollow ugc noreferrer">View supplier listing ↗</a></p>
<progress value="${buy.quantity}" max="${buy.target}" aria-label="Interest toward the minimum"></progress><p><strong>${buy.quantity} of ${buy.target}</strong> units requested</p>
<h2>Shipping and pickup</h2>
${shipping == null ? '<p>Shipping estimate pending.</p>' : `<p><strong>${usd.format(shipping / 100 / buy.target)} estimated shipping per unit</strong> at ${buy.target} units, based on a ${usd.format(shipping / 100)} shipment. Product cost and other charges are separate.</p>`}
<p class="details">${escape(update?.pickup_details || 'Pickup details pending.')}</p>
${update?.organizer_note ? `<p class="details">${escape(update.organizer_note)}</p>` : ''}
${buy.status === 'closed' ? '<p>This group buy is closed.</p>' : `<h2>Register interest</h2><p>Joining records your requested quantity. It does not place an order or charge you. The organizer can use your email to coordinate this buy.</p><p>${paymentNotice}</p>
<form method="post" class="stack"><label>Quantity<input type="number" name="quantity" min="1" max="10000" value="1" required></label>
<label>Email<input type="email" name="email" maxlength="254" required></label>${captcha(url, env)}<button>Join group buy</button></form>`}`),
  { path: `/buys/${slug}`, description: buy.description.slice(0, 155) });
}
async function submitProposal(form, db) {
  const title = field(form, 'title');
  const region = field(form, 'region');
  const supplier = supplierUrl(field(form, 'supplier'));
  const category = field(form, 'category');
  const description = field(form, 'description');
  const email = emailFrom(form);
  const target = integer(form, 'target', 2, 100000);
  if (title.length < 3 || title.length > 100 || region.length < 2 || region.length > 80 ||
      !supplier || !categories.includes(category) || description.length < 10 || description.length > 2000 || !email || !target) {
    return errorPage(400, 'Check the product details and use an HTTPS supplier link.');
  }
  const prefix = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'group-buy';
  const slug = `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  const result = await db.prepare(`INSERT INTO buys(slug,title,category,region,supplier,description,target,email)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`).bind(slug,title,category,region,supplier,description,target,email).run();
  if (!result.meta.changes) return errorPage(409, 'A proposal for this supplier link and pickup area already exists.');
  return redirect('/propose?submitted=1');
}
async function join(form, db, slug) {
  const email = emailFrom(form);
  const quantity = integer(form, 'quantity', 1, 10000);
  if (!email || !quantity) return errorPage(400, 'Enter a valid email and quantity.');
  const token = crypto.randomUUID() + crypto.randomUUID();
  const result = await db.prepare(`INSERT INTO interests(slug,email,quantity,management_hash)
    SELECT slug,?,?,? FROM buys WHERE slug=? AND status='open'
    ON CONFLICT DO NOTHING`).bind(email,quantity,await hash(token),slug).run();
  if (!result.meta.changes) return errorPage(409, 'This group buy is closed or that email has already joined.');
  return redirect(`/interest/${token}`);
}
async function manage(form, db, token) {
  const key = await hash(token);
  const row = await db.prepare(`SELECT i.slug,i.quantity,b.title,b.status FROM interests i
    JOIN buys b ON b.slug=i.slug WHERE i.management_hash=?`).bind(key).first();
  if (!row) return errorPage(404, 'Interest record not found.');
  if (form) {
    if (field(form, 'action') === 'withdraw') {
      await db.prepare('DELETE FROM interests WHERE management_hash=?').bind(key).run();
      return redirect(`/buys/${row.slug}`);
    }
    const quantity = integer(form, 'quantity', 1, 10000);
    if (!quantity) return errorPage(400, 'Enter a valid quantity.');
    const result = await db.prepare(`UPDATE interests SET quantity=? WHERE management_hash=?
      AND EXISTS(SELECT 1 FROM buys WHERE slug=interests.slug AND status='open')`).bind(quantity,key).run();
    if (!result.meta.changes) return errorPage(409, 'This group buy is closed or the interest was withdrawn.');
    return redirect(`/interest/${token}`);
  }
  return page('Manage interest', section(`<h1>Manage your interest</h1><p>${escape(row.title)} · ${row.quantity} units</p>
<p>Save this private link to update or withdraw your interest later.</p>
${row.status === 'open' ? `<form method="post" class="stack"><label>Quantity<input type="number" name="quantity" value="${row.quantity}" min="1" max="10000" required></label><button>Update quantity</button></form>` : ''}
<form method="post" class="stack"><button name="action" value="withdraw">Withdraw interest</button></form>
<p><a href="/buys/${escape(row.slug)}">View group buy</a></p>`));
}
async function admin(form, db, slug) {
  if (form) {
    if (!slug) return errorPage(404, 'Proposal not found.');
    const action = field(form, 'action');
    if (action === 'update') {
      const rawShipping = field(form, 'shipping');
      const shippingCents = rawShipping === '' ? null : Math.round(Number(rawShipping) * 100);
      const pickup = field(form, 'pickup');
      const note = field(form, 'note');
      if ((rawShipping && (!/^\d{1,7}(\.\d{1,2})?$/.test(rawShipping) || shippingCents > 100000000)) ||
          pickup.length > 500 || note.length > 1000) {
        return errorPage(400, 'Check the shipping estimate, pickup details, and organizer note.');
      }
      const result = await db.prepare(`INSERT INTO buy_updates(slug,shipping_cents,pickup_details,organizer_note)
        SELECT slug,?,?,? FROM buys WHERE slug=? AND status IN ('open','closed')
        ON CONFLICT(slug) DO UPDATE SET shipping_cents=excluded.shipping_cents,
          pickup_details=excluded.pickup_details, organizer_note=excluded.organizer_note`)
        .bind(shippingCents, pickup, note, slug).run();
      return result.meta.changes ? redirect(`/admin/${slug}`) : errorPage(409, 'Approve this proposal before publishing an update.');
    }
    const transitions = { approve: ['pending','open'], reject: ['pending','rejected'], close: ['open','closed'] };
    if (!Object.hasOwn(transitions, action)) return errorPage(400, 'Invalid action.');
    const [before, after] = transitions[action];
    const result = await db.prepare('UPDATE buys SET status=? WHERE slug=? AND status=?').bind(after,slug,before).run();
    if (!result.meta.changes) return errorPage(409, 'The group buy already changed status.');
    return redirect(`/admin/${slug}`);
  }
  if (!slug) {
    const { results } = await db.prepare(`SELECT slug,title,region,status FROM buys ORDER BY
      status='pending' DESC, created_at DESC LIMIT 200`).all();
    return page('Organizer', section(`<h1>Organizer dashboard</h1><ul class="admin-list">${results.map(row =>
      `<li><a href="/admin/${row.slug}">${escape(row.title)}</a> · ${escape(row.region)} · ${row.status}</li>`).join('') || '<li>No proposals yet.</li>'}</ul>`));
  }
  const buy = await db.prepare('SELECT * FROM buys WHERE slug=?').bind(slug).first();
  if (!buy) return errorPage(404, 'Proposal not found.');
  const { results } = await db.prepare('SELECT email,quantity FROM interests WHERE slug=? ORDER BY created_at').bind(slug).all();
  const actions = buy.status === 'pending' ? ['approve','reject'] : buy.status === 'open' ? ['close'] : [];
  const publicBuy = ['open', 'closed'].includes(buy.status);
  const update = publicBuy ? await db.prepare('SELECT * FROM buy_updates WHERE slug=?').bind(slug).first() : null;
  return page('Review group buy', section(`<a href="/admin">← Organizer dashboard</a><h1>${escape(buy.title)}</h1>
<p>${escape(buy.category)} · ${escape(buy.region)} · ${buy.status}</p><p>Minimum: ${buy.target}</p>
<p class="details">${escape(buy.description)}</p><p>Proposed by ${escape(buy.email)}</p>
<p><a href="${escape(buy.supplier)}" rel="nofollow ugc noreferrer">Review supplier link ↗</a></p>
${actions.length ? `<form method="post" class="actions">${actions.map(action => `<button name="action" value="${action}">${action}</button>`).join('')}</form>` : ''}
${publicBuy ? `<h2>Public update</h2><p>Use a general pickup area or window. Share private addresses and payment arrangements directly with participants.</p>
<form method="post" class="stack">
<label>Estimated total shipping (USD)<input name="shipping" type="number" min="0" max="1000000" step="0.01" value="${update?.shipping_cents == null ? '' : (update.shipping_cents / 100).toFixed(2)}"></label>
<label>Public pickup details<textarea name="pickup" maxlength="500">${escape(update?.pickup_details ?? '')}</textarea></label>
<label>Public organizer note<textarea name="note" maxlength="1000">${escape(update?.organizer_note ?? '')}</textarea></label>
<button name="action" value="update">Publish update</button></form>` : ''}
<h2>Participants</h2><ul>${results.map(row => `<li>${escape(row.email)} · ${row.quantity} units</li>`).join('') || '<li>No participants yet.</li>'}</ul>`));
}
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const path = url.pathname;
  const posting = request.method === 'POST';
  if (request.method !== 'GET' && !posting) return errorPage(405, 'Method not allowed.');
  if (posting && request.headers.get('Origin') !== url.origin) return errorPage(403, 'Open the form on this site and try again.');
  if (posting && request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') {
    return errorPage(415, 'Use the form on this site to submit your request.');
  }
  const buy = path.match(/^\/buys\/([a-z0-9-]{1,80})$/);
  const organizer = path.match(/^\/admin(?:\/([a-z0-9-]{1,80}))?$/);
  const interest = path.match(/^\/interest\/([a-f0-9-]{72})$/);
  try {
    if (organizer && !adminAllowed(request, env)) return adminChallenge();
    const form = posting ? await readForm(request) : null;
    if (posting && !form) return errorPage(413, 'Form submission is too large or empty.');
    if (organizer) return await admin(form, env.DB, organizer[1]);
    if (interest) return await manage(form, env.DB, interest[1]);
    if (posting && (buy || path === '/propose')) {
      if (!await verified(form, url, env)) return errorPage(403, 'Verification failed. Return to the form and try again.');
      return buy ? await join(form, env.DB, buy[1]) : await submitProposal(form, env.DB);
    }
    if (posting) return errorPage(405, 'Method not allowed.');
    if (path === '/') return await home(url, env.DB);
    if (buy) return await buyPage(url, env, buy[1]);
    if (path === '/propose') return url.searchParams.has('submitted') ?
      page('Proposal received', section('<h1>Proposal received</h1><p>It will appear after organizer review.</p><a href="/">Browse group buys</a>')) : propose(url, env);
    if (path === '/robots.txt') return content(`User-agent: *\nDisallow: /admin\nDisallow: /interest/\nSitemap: ${canonical}/sitemap.xml\n`, 'text/plain; charset=utf-8');
    if (path === '/sitemap.xml') {
      const { results } = await env.DB.prepare("SELECT slug FROM buys WHERE status IN ('open','closed') ORDER BY slug").all();
      const paths = ['/', ...results.map(row => `/buys/${row.slug}`)];
      return content(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(item =>
        `<url><loc>${canonical}${escape(item)}</loc></url>`).join('')}</urlset>`, 'application/xml; charset=utf-8');
    }
    if (path === '/style.css' && next) return next();
    return errorPage(404, 'Page not found.');
  } catch {
    return errorPage(503, 'The service is temporarily unavailable. Try again shortly.');
  }
}
