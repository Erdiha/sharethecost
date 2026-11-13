# Deployment Guide - Share the Cost

## Security & Secrets

⚠️ **IMPORTANT: Do NOT commit sensitive information to git:**
- Database IDs
- API keys
- Admin passwords
- Environment variables

All secrets are managed via Cloudflare dashboard, not in code.

---

## Prerequisites

- Cloudflare account with Workers enabled
- D1 Database created
- Custom domain: sharethecost.whenly.org configured at your registrar
- Node.js >=24 installed

---

## Step 1: Get Your D1 Database ID

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Workers & Pages → D1 → Create Database → "sharethecost"
3. Copy the Database ID

---

## Step 2: Configure Local Environment

```bash
# Copy the template
cp wrangler.local.toml wrangler.toml

# Edit wrangler.toml and replace:
# database_id = "YOUR_D1_DATABASE_ID_HERE"
# With your actual D1 database ID from step 1

nano wrangler.toml
```

⚠️ `wrangler.toml` in the repo has placeholder ID for security.
⚠️ Never commit your actual database ID to git.

---

## Step 3: Install Dependencies

```bash
npm install
```

---

## Step 4: Test Locally

```bash
npm test              # Run all tests (11 tests)
npm run dev          # Start dev server on http://127.0.0.1:8788
```

---

## Step 5: Deploy to Cloudflare Workers

```bash
wrangler deploy
```

Output will show:
- Worker URL (e.g., sharethecost.YOUR_ACCOUNT.workers.dev)
- Database binding status
- Migrations applied

---

## Step 6: Connect Custom Domain

1. Cloudflare Dashboard → Workers → sharethecost
2. Settings → Custom Domains
3. Add Domain: `sharethecost.whenly.org`
4. Cloudflare provides CNAME record
5. Add CNAME at your domain registrar

Wait for DNS propagation (~5 minutes).

---

## Step 7: Verify Production Deployment

```bash
curl https://sharethecost.whenly.org/
# Should return homepage with disclaimer
```

---

## Admin Access

Production admin panel: `https://sharethecost.whenly.org/admin`

Authentication:
- Username: `admin`
- Password: Set via `ADMIN_PASSWORD` environment variable in Cloudflare Workers

To set environment variable:
1. Cloudflare Dashboard → Workers → sharethecost
2. Settings → Variables → Environment Variables
3. Add: `ADMIN_PASSWORD` = your secure password

---

## Maintenance

### Database Migrations
Migrations auto-apply on worker startup from `migrations/` directory:
- 0001_initial.sql (schema)
- 0002_buy_updates.sql (organizer coordination)
- 0003_email_normalization.sql (email case-fix)

### Monitoring
View worker logs:
```bash
wrangler tail
```

### Updates
To deploy code changes:
```bash
git add .
git commit -m "Your changes"
git push
wrangler deploy
```

---

## Troubleshooting

### Database ID not found
- Check D1 database exists in Cloudflare dashboard
- Verify database_id in wrangler.toml is correct
- Don't commit actual IDs to git

### Custom domain not working
- Wait for DNS propagation (can take 5-30 minutes)
- Verify CNAME record is correct: `wrangler cf-tunnel`
- Check domain settings in Cloudflare dashboard

### Admin login not working
- Verify `ADMIN_PASSWORD` environment variable is set in Cloudflare dashboard
- Login with: `admin:YOUR_PASSWORD`

### Migrations not applying
- Check D1 database is writable
- Verify migrations_dir path is correct in wrangler.toml
- View logs: `wrangler tail`

---

## Security Checklist

✅ Database ID NOT committed to git
✅ Admin password stored in Cloudflare variables only
✅ HTTPS enforced (Cloudflare automatic)
✅ XSS protection (HTML escaping)
✅ CSRF protection (Origin header)
✅ CSP headers set
✅ Private IPs blocked in supplier URLs
✅ No tracking params in URLs
✅ Email validation & normalization

---

## Support

Questions? Check:
- GitHub: https://github.com/Erdiha/sharethecost
- Cloudflare Docs: https://developers.cloudflare.com/workers/
- D1 Docs: https://developers.cloudflare.com/d1/
