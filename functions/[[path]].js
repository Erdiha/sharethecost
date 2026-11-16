const categories = ['Home & garden', 'Tools & hardware', 'Electronics', 'Sports & outdoors', 'Other'];
const canonical = 'https://sharethecost.whenly.org';
const homeDescription = 'Browse local group buys or propose one in your neighborhood. Coordinate bulk orders, split shipping costs, and arrange pickup with your community.';
const socialImage = `${canonical}/assets/social.jpg`;
const websiteData = {
  '@context': 'https://schema.org', '@type': 'WebSite', name: 'Share the Cost',
  url: `${canonical}/`, description: homeDescription,
  publisher: { '@type': 'Organization', name: 'Haci Group', url: 'https://www.hacigroup.org/' },
};
const frameParents = 'https://whenly.org https://www.whenly.org https://whenly-theta.vercel.app';
const paymentNotice = 'Share the Cost never collects payments or card details. Buyers arrange payment directly with the supplier or organizer.';
const disclaimer = 'This is a public community help initiative by Haci Group. Share the Cost is a free platform that facilitates group buying to help community members save on bulk purchases.';
const policyLinks = '<a href="/privacy">Privacy</a> <a href="/terms">Terms</a>';
const contact = '<a href="mailto:contact@hacigroup.org">contact@hacigroup.org</a>';
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const escape = (value = '') => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const content = (text, type, status = 200) => new Response(text, {
  status,
  headers: {
    'Content-Type': type, 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; script-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  },
});
function page(title, body, { status = 200, path, description = homeDescription } = {}) {
  const fullTitle = `${title} | Share the Cost`;
  const pageUrl = path && canonical + path;
  const hasCategoryPicker = path === '/' || path === '/propose';
  const response = content(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(fullTitle)}</title><meta name="description" content="${escape(description)}">
${pageUrl ? `<link rel="canonical" href="${escape(pageUrl)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Share the Cost">
<meta property="og:title" content="${escape(fullTitle)}"><meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${escape(pageUrl)}"><meta property="og:image" content="${socialImage}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Share the Cost — Local group buys">
<meta name="twitter:card" content="summary_large_image">` : '<meta name="robots" content="noindex">'}
${path === '/' ? `<script type="application/ld+json">${JSON.stringify(websiteData)}</script>` : ''}
${hasCategoryPicker ? '<script src="/assets/category-filter.js?v=2" defer></script>' : ''}
<link rel="icon" type="image/png" sizes="96x96" href="/assets/favicon.png">
<link rel="stylesheet" href="/style.css?v=2"></head><body>
<header><nav class="wrap site-nav" aria-label="Main navigation">
<a class="brand" href="/"><span aria-hidden="true">↗</span> Share the Cost</a>
<div class="nav-links"><a href="/#browse">Browse</a><a href="/#how">How it works</a></div>
<a class="button quiet" href="/propose">Propose a buy</a></nav></header>
<main>${body}</main><footer class="wrap"><div><strong>Share the Cost</strong><p>A Haci Group community initiative. Explore more <a href="https://whenly.org/">Whenly tools</a>. Payments are arranged directly with the supplier or organizer.</p></div><div class="footer-links">${policyLinks}</div></footer></body></html>`, 'text/html; charset=utf-8', status);
  if (hasCategoryPicker) {
    const policy = response.headers.get('Content-Security-Policy');
    response.headers.set('Content-Security-Policy', policy.replace('script-src ', "script-src 'self' "));
  }
  return response;
}
const section = body => `<section class="wrap narrow">${body}</section>`;
const errorPage = (status, message) => page('Something went wrong', section(`<h1>${escape(message)}</h1><a href="/">Back to group buys</a>`), { status });
const redirect = path => new Response(null, { status: 303, headers: {
  Location: path, 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
} });
const field = (form, key) => String(form.get(key) ?? '').trim();
const maxFormBytes = 48 * 1024;
const turnstileConfigured = env => Boolean(env.TURNSTILE_SITE_KEY?.trim() && env.TURNSTILE_SECRET?.trim());
const submissionMessages = new Map([
  [403, 'Verification failed. Complete a fresh verification and try again.'],
  [429, 'This verification was already used or there were too many submissions. Try again in a few minutes.'],
  [503, 'Verification is temporarily unavailable. Please try again shortly.'],
]);
function submissionNotice(url) {
  const message = submissionMessages.get(Number(url.searchParams.get('verification')));
  return message ? `<p role="alert">${escape(message)}</p>` : '';
}


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
export function supplierUrl(value, { normalize = true } = {}) {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(hostname) ||
        /\.(?:localhost|local|internal|lan|home\.arpa)$/.test(hostname)) return null;

    url.hostname = hostname;
    if (!normalize) return url.href;
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
function captcha(url, env, action) {
  if (dev(url, env)) return '';
  if (!turnstileConfigured(env)) return '<p role="alert">Online verification is temporarily unavailable. Please try again later.</p>';
  return `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<div class="cf-turnstile" data-sitekey="${escape(env.TURNSTILE_SITE_KEY)}" data-action="${action}" data-size="compact"></div>`;
}
async function checkSubmission(request, form, url, env, action) {
  if (dev(url, env)) return null;
  if (!turnstileConfigured(env)) return errorPage(503, 'Form submissions are temporarily unavailable. Please try again later.');
  const token = field(form, 'cf-turnstile-response');
  const rejected = () => errorPage(403, 'Verification failed. Return to the form and try again.');
  if (!token || token.length > 2048) return rejected();
  const address = request.headers.get('CF-Connecting-IP') ?? '';
  let result;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', signal: AbortSignal.timeout(5000),
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, ...(address && { remoteip: address }) }),
    });
    if (!response.ok) return errorPage(503, submissionMessages.get(503));
    result = await response.json();
  } catch {
    return errorPage(503, submissionMessages.get(503));
  }
  if (result.success !== true || result.hostname !== url.hostname || result.action !== action) return rejected();

  const [tokenHash, clientHash] = await Promise.all([
    hash(token), hash(`${env.TURNSTILE_SECRET}\0${address}`),
  ]);
  const check = await env.DB.prepare(`INSERT INTO submission_checks(token_hash,client_hash,expires_at)
    SELECT ?,?,unixepoch()+600 WHERE (
      SELECT COUNT(*) FROM submission_checks WHERE client_hash=? AND expires_at > unixepoch()
    ) < 12 ON CONFLICT(token_hash) DO NOTHING`).bind(tokenHash, clientHash, clientHash).run();
  if (check.meta.changes) return null;
  const limited = errorPage(429, 'This verification was already used or there were too many submissions. Try again with a fresh verification in a few minutes.');
  limited.headers.set('Retry-After', '600');
  return limited;
}
function adminAllowed(request, env) {
  const auth = request.headers.get('Authorization') ?? '';
  if (!env.ADMIN_PASSWORD || !auth.startsWith('Basic ')) return false;
  try { return atob(auth.slice(6)) === `admin:${env.ADMIN_PASSWORD}`; } catch { return false; }
}
function adminChallenge() {
  const response = content('Organizer login required', 'text/plain; charset=utf-8', 401);
  response.headers.set('WWW-Authenticate', 'Basic realm="Share the Cost organizer"');
  return response;
}
const listing = `SELECT b.slug,b.title,b.category,b.region,b.description,b.target,b.supplier,b.supplier_link,b.status,
  (SELECT COALESCE(SUM(quantity),0) FROM interests i WHERE i.slug=b.slug) AS quantity FROM buys b`;
function card(buy) {
  return `<article class="card"><div class="tag">${escape(buy.category)}</div>
<h3><a href="/buys/${escape(buy.slug)}">${escape(buy.title)}</a></h3><p>${escape(buy.region)}</p>
<progress value="${buy.quantity}" max="${buy.target}" aria-label="Interest toward the minimum"></progress>
<p>${buy.quantity} of ${buy.target} units requested</p></article>`;
}
function categoryPicker({ selected = '', required = false } = {}) {
  const choices = ['', ...categories];
  const placeholder = required ? 'Select a category' : 'All categories';
  return `<details class="category-filter${required ? ' field-half' : ''}">
<summary><span class="filter-label">Category</span><span class="category-value">
${choices.map(item => `<span>${escape(item || placeholder)}</span>`).join('')}
</span></summary>
<fieldset aria-label="Category options">
${choices.map((item, index) => required && !item ? '' : `<label><input type="radio" id="filter-category-${index}" name="category" value="${escape(item)}"${item === selected ? ' checked' : ''}${required && index === 1 ? ' required' : ''}>${escape(item || placeholder)}</label>`).join('')}
</fieldset>
${required ? '<span class="category-error" role="alert" hidden>Select a category.</span>' : ''}
</details>`;
}

async function home(url, db) {
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  const requestedCategory = url.searchParams.get('category');
  const category = categories.includes(requestedCategory) ? requestedCategory : '';
  const { results } = await db.prepare(`${listing} WHERE b.status='open'
    AND (?='' OR instr(lower(b.title||' '||b.region),lower(?))>0)
    AND (?='' OR b.category=?) ORDER BY b.created_at DESC,b.slug LIMIT 60`)
    .bind(query, query, category, category).all();
  const empty = query || category
    ? '<h3>No matching group buys</h3><p>Try a different search or category.</p><a href="/#browse">Clear filters</a>'
    : '<h3>No active group buys yet</h3><p>Suggest a product, a supplier, and a pickup area to get your neighborhood started.</p><a href="/propose">Propose the first buy <span aria-hidden="true">↗</span></a>';
  return page('Local Group Buys & Bulk Orders', `<section class="hero wrap" aria-labelledby="hero-title">
<div class="hero-copy">
<h1 id="hero-title">Local group buys,<br>shared costs.</h1>
<p>Find neighbors who want the same products. Pool orders to meet supplier minimums and split shipping.</p>
<div class="actions hero-actions">
<a class="button primary" href="#browse">Browse active buys <span aria-hidden="true">↓</span></a>
<a class="text-link" href="/propose">Start a buy <span aria-hidden="true">↗</span></a>
</div>
</div>
<div class="search-panel">
<h2>Find a group buy</h2>
<form class="filters" action="/#browse" role="search" aria-label="Group buys">
<label>Search products or pickup areas<input type="search" name="q" value="${escape(query)}" placeholder="Product or city"></label>
${categoryPicker({ selected: category })}
<button>Search</button>
</form>
</div>
</section>

<section class="wrap section-block" id="browse" aria-labelledby="browse-title">
<div class="section-header">
<h2 id="browse-title">Active group buys</h2>
${query || category ? '<p>Showing results for your search.</p>' : '<p>Browse proposals that are open for interest.</p>'}
</div>
${results.length ? `<div class="cards-grid">${results.map(card).join('')}</div>` : `<div class="empty-state">${empty}</div>`}
</section>

<section class="how-it-works" id="how" aria-labelledby="how-title">
<div class="wrap">
<div class="section-header"><h2 id="how-title">How group buying works</h2></div>
<ol class="steps">
<li class="step"><h3>Propose a product</h3><p>Add a supplier link, minimum order quantity, and general pickup area. An organizer reviews it before publication.</p></li>
<li class="step"><h3>Register interest</h3><p>Choose how many units you want. Save your private link to update or withdraw your interest.</p></li>
<li class="step"><h3>Coordinate the order</h3><p>The organizer confirms shipping and pickup. Registering interest places no order, and the site collects no payments.</p></li>
</ol>
</div>
</section>`, { path: '/', description: homeDescription });
}

function propose(url, env) {
  return page('Propose a group buy', section(`<h1>Propose a group buy</h1><p>Approved proposals appear on the site. Your email stays private and is available to the organizer for coordination.</p><p>${paymentNotice}</p>
${submissionNotice(url)}
<form method="post" class="stack proposal-form">
<label>Product name<input name="title" required minlength="3" maxlength="100"></label>
${categoryPicker({ required: true })}
<label class="field-half">Pickup area<input name="region" required minlength="2" maxlength="80" placeholder="City, state"></label>
<label class="field-half">Supplier URL<input type="url" name="supplier" required maxlength="2048" aria-describedby="supplier-help"></label>
<label class="field-half">Minimum order quantity<input type="number" name="target" required min="2" max="100000"></label>
<label>Product and shipping details<textarea name="description" required minlength="10" maxlength="2000"></textarea></label>
<p id="supplier-help">Use a public product link. Keep private links, home addresses, phone numbers, and payment details out of public fields.</p>
<label>Email<input type="email" name="email" required maxlength="254"></label>
<p>${policyLinks}</p>
${captcha(url, env, 'propose')}<button>Submit for review</button></form>`), {
    path: '/propose', description: 'Suggest a local group buy with a supplier link, pickup area, and minimum order quantity. Approved proposals are published for neighbors to join.',
  });
}
function privacyPage() {
  return page('Privacy', section(`<h1>Privacy</h1>
<p>Share the Cost is a Haci Group community initiative. We collect your email and the information you enter when you propose a group buy or register interest. The site organizer can view your email to review proposals and coordinate the buy.</p>
<p>Approved product details and organizer updates are public, along with total quantities requested. The site keeps email addresses out of public listings. Keep personal and payment information out of public fields.</p>
<p>Cloudflare hosts the site and database. The forms use Cloudflare Turnstile to check for automated submissions. Turnstile processes browser and network signals such as the IP address. <a href="https://www.cloudflare.com/turnstile-privacy-policy/" target="_blank" rel="noopener noreferrer">Cloudflare Turnstile Privacy Addendum (opens in a new tab)</a>. Supplier websites handle their own data.</p>
<p>To prevent repeated submissions, the site counts recently verified requests using an identifier derived from the IP address. Entries expire after ten minutes.</p>
<p>Use the private link shown after you register to withdraw interest and remove that registration from the site. For privacy questions or requests about information you submitted, email ${contact}.</p>`), { path: '/privacy', description: 'Read how Share the Cost uses proposal details, email addresses, and information submitted for local group buys.' });
}
function termsPage() {
  return page('Terms', section(`<h1>Terms</h1><p>${disclaimer}</p>
<p>Registering interest is optional and creates no order or payment obligation through this site. ${paymentNotice}</p>
<p>Prices, shipping costs, availability, and pickup details may change. Before paying anyone, confirm the seller, total price, delivery or pickup terms, and return policy directly with the supplier or organizer.</p>
<p>Submit lawful products, accurate information, and links you are authorized to share. Keep personal addresses, contact information, and payment details out of public submissions. Haci Group reviews proposals before publication and may remove misleading, unsafe, or unlawful listings.</p>
<p>To report a listing or broken supplier link, email ${contact}.</p>`), { path: '/terms', description: 'Read the terms for proposing and joining local group buys, arranging pickup, and coordinating payments with suppliers and organizers.' });
}
async function buyPage(url, env, slug, embedded) {
  const buy = await env.DB.prepare(`${listing} WHERE b.slug=? AND b.status IN ('open','closed')`).bind(slug).first();
  if (!buy) return errorPage(404, 'Group buy not found.');
  const update = await env.DB.prepare('SELECT * FROM buy_updates WHERE slug=?').bind(slug).first();
  const shipping = update?.shipping_cents;
  const supplier = supplierUrl(buy.supplier_link ?? buy.supplier, { normalize: false });
  return page(buy.title, section(`<a href="/#browse">← All group buys</a><p class="tag">${escape(buy.category)}</p><h1>${escape(buy.title)}</h1>
<p>Pickup area: ${escape(buy.region)}</p><p class="details">${escape(buy.description)}</p>
${supplier ? `<p><a href="${escape(supplier)}" target="_blank" rel="noopener noreferrer nofollow ugc">View supplier listing (opens in a new tab) ↗</a></p>` : '<p>Supplier link unavailable.</p>'}
<progress value="${buy.quantity}" max="${buy.target}" aria-label="Interest toward the minimum"></progress><p><strong>${buy.quantity} of ${buy.target}</strong> units requested</p>
<h2>Shipping and pickup</h2>
${shipping == null ? '<p>Shipping estimate pending.</p>' : `<p><strong>${usd.format(shipping / 100 / buy.target)} estimated shipping per unit</strong> at ${buy.target} units, based on a ${usd.format(shipping / 100)} shipment. Product cost and other charges are separate.</p>`}
<p class="details">${escape(update?.pickup_details || 'Pickup details pending.')}</p>
${update?.organizer_note ? `<p class="details">${escape(update.organizer_note)}</p>` : ''}
${buy.status === 'closed' ? '<p>This group buy is closed.</p>' : `<h2>Register interest</h2><p>Joining records your requested quantity. It does not place an order or charge you. The organizer can use your email to coordinate this buy.</p><p>${paymentNotice}</p>
${submissionNotice(url)}
<form method="post" class="stack"${embedded ? ' target="_blank" rel="noopener"' : ''}><label>Quantity<input type="number" name="quantity" min="1" max="10000" value="1" required></label>
<label>Email<input type="email" name="email" maxlength="254" required></label><p>${policyLinks}</p>${captcha(url, env, 'join')}<button>${embedded ? 'Join group buy (opens in a new tab)' : 'Join group buy'}</button></form>`}`),
  { path: `/buys/${slug}`, description: buy.description.slice(0, 155) });
}
async function submitProposal(form, db) {
  const title = field(form, 'title');
  const region = field(form, 'region');
  const supplierLink = supplierUrl(field(form, 'supplier'), { normalize: false });
  const category = field(form, 'category');
  const description = field(form, 'description');
  const email = emailFrom(form);
  const target = integer(form, 'target', 2, 100000);
  if (title.length < 3 || title.length > 100 || region.length < 2 || region.length > 80 ||
      !supplierLink || !categories.includes(category) || description.length < 10 || description.length > 2000 || !email || !target) {
    return errorPage(400, 'Check the product details and use an HTTPS supplier link.');
  }
  const prefix = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'group-buy';
  const slug = `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  const result = await db.prepare(`INSERT INTO buys(slug,title,category,region,supplier,supplier_link,description,target,email)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`).bind(slug,title,category,region,supplierUrl(supplierLink),supplierLink,description,target,email).run();
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
      return redirect(row.status === 'rejected' ? '/' : `/buys/${row.slug}`);
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
${row.status === 'rejected' ? '<p>This listing has been removed.</p>' : `<p><a href="/buys/${escape(row.slug)}">View group buy</a></p>`}`));
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
    if (action === 'remove') {
      const result = await db.prepare("UPDATE buys SET status='rejected' WHERE slug=? AND status IN ('open','closed')").bind(slug).run();
      return result.meta.changes ? redirect(`/admin/${slug}`) : errorPage(409, 'This listing is no longer public.');
    }
    const transitions = { approve: ['pending','open'], reject: ['pending','rejected'], close: ['open','closed'] };
    if (!Object.hasOwn(transitions, action)) return errorPage(400, 'Invalid action.');
    if (action === 'approve') {
      const proposal = await db.prepare("SELECT supplier,supplier_link FROM buys WHERE slug=? AND status='pending'").bind(slug).first();
      if (proposal && !supplierUrl(proposal.supplier_link ?? proposal.supplier, { normalize: false })) {
        return errorPage(409, 'This proposal needs a valid supplier link before it can be published.');
      }
    }
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
  const publicBuy = ['open', 'closed'].includes(buy.status);
  const supplier = supplierUrl(buy.supplier_link ?? buy.supplier, { normalize: false });
  const actions = buy.status === 'pending' ? (supplier ? ['approve','reject'] : ['reject']) : buy.status === 'open' ? ['close','remove'] : publicBuy ? ['remove'] : [];
  const update = publicBuy ? await db.prepare('SELECT * FROM buy_updates WHERE slug=?').bind(slug).first() : null;
  return page('Review group buy', section(`<a href="/admin">← Organizer dashboard</a><h1>${escape(buy.title)}</h1>
<p>${escape(buy.category)} · ${escape(buy.region)} · ${buy.status}</p><p>Minimum: ${buy.target}</p>
<p class="details">${escape(buy.description)}</p><p>Proposed by ${escape(buy.email)}</p>
${supplier ? `<p><a href="${escape(supplier)}" target="_blank" rel="noopener noreferrer nofollow ugc">Review supplier link (opens in a new tab) ↗</a></p>` : '<p>Supplier link unavailable.</p>'}
${actions.length ? `<form method="post" class="actions">${actions.map(action => `<button name="action" value="${action}">${action === 'remove' ? 'Remove listing' : action}</button>`).join('')}</form>` : ''}
${publicBuy ? `<h2>Public update</h2><p>Use a general pickup area or window. Share private addresses and payment arrangements directly with participants.</p>
<form method="post" class="stack">
<label>Estimated total shipping (USD)<input name="shipping" type="number" min="0" max="1000000" step="0.01" value="${update?.shipping_cents == null ? '' : (update.shipping_cents / 100).toFixed(2)}"></label>
<label>Public pickup details<textarea name="pickup" maxlength="500">${escape(update?.pickup_details ?? '')}</textarea></label>
<label>Public organizer note<textarea name="note" maxlength="1000">${escape(update?.organizer_note ?? '')}</textarea></label>
<button name="action" value="update">Publish update</button></form>` : ''}
<h2>Participants</h2><ul>${results.map(row => `<li>${escape(row.email)} · ${row.quantity} units</li>`).join('') || '<li>No participants yet.</li>'}</ul>`));
}
async function handleRequest({ request, env, next }) {
  const url = new URL(request.url);
  const path = url.pathname;
  const posting = request.method === 'POST';
  if (request.method !== 'GET' && request.method !== 'HEAD' && !posting) return errorPage(405, 'Method not allowed.');
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
      const rejected = await checkSubmission(request, form, url, env, buy ? 'join' : 'propose');
      if (rejected) {
        if (request.headers.get('Accept')?.includes('text/html')) {
          return redirect(`${path}?verification=${rejected.status}`);
        }
        return rejected;
      }
      return buy ? await join(form, env.DB, buy[1]) : await submitProposal(form, env.DB);
    }
    if (posting) return errorPage(405, 'Method not allowed.');
    if (path === '/') return await home(url, env.DB);
    if (buy) return await buyPage(url, env, buy[1], request.headers.get('Sec-Fetch-Dest') === 'iframe');
    if (path === '/propose') return url.searchParams.has('submitted') ?
      page('Proposal received', section('<h1>Proposal received</h1><p>It will appear after organizer review.</p><a href="/">Browse group buys</a>')) : propose(url, env);
    if (path === '/privacy') return privacyPage();
    if (path === '/terms') return termsPage();
    if (path === '/robots.txt') return content(`User-agent: *\nDisallow: /admin\nDisallow: /interest/\nSitemap: ${canonical}/sitemap.xml\n`, 'text/plain; charset=utf-8');
    if (path === '/sitemap.xml') {
      const { results } = await env.DB.prepare("SELECT slug FROM buys WHERE status IN ('open','closed') ORDER BY slug").all();
      const paths = ['/', '/propose', '/privacy', '/terms', ...results.map(row => `/buys/${row.slug}`)];
      return content(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(item =>
        `<url><loc>${canonical}${escape(item)}</loc></url>`).join('')}</urlset>`, 'application/xml; charset=utf-8');
    }
    if ((path === '/style.css' || path.startsWith('/assets/')) && next) return next();
    return errorPage(404, 'Page not found.');
  } catch {
    return errorPage(503, 'The service is temporarily unavailable. Try again shortly.');
  }
}

export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);
  let response = await handleRequest(context);
  if (context.request.method === 'HEAD') response = new Response(null, response);
  if (!['/', '/propose', '/privacy', '/terms'].includes(pathname) && !/^\/buys\/[a-z0-9-]{1,80}$/.test(pathname)) return response;
  const policy = response.headers.get('Content-Security-Policy');
  if (!policy) return response;
  response.headers.delete('X-Frame-Options');
  response.headers.set('Content-Security-Policy', policy.replace("frame-ancestors 'none'", `frame-ancestors ${frameParents}`));
  return response;
}
