# Share the Cost

A group-buying site for people who want to combine orders and split shipping. Public pages list approved proposals and current interest. An organizer reviews submissions and coordinates quotes and pickup. Payments take place separately.

## Local development

Requires Node.js 24 or later and uses built-in SQLite. There are no packages to install for local use.

```sh
npm run dev
npm test
```

Open http://127.0.0.1:8788. The local organizer dashboard is at `/admin`, with username `admin` and password `local-preview`. Set `ADMIN_PASSWORD` to override that value. Use the organizer dashboard to approve a new proposal. Local records persist in `sharethecost.sqlite`. The local database and the deployed database are independent.

After approval, use the organizer dashboard to publish the estimated shipping total, general pickup window, and a public note. The buy page divides estimated shipping by the minimum order quantity. Buyers arrange payment directly with the supplier or organizer.

## Cloudflare deployment

1. Log in with `npx wrangler@4 login`. Keep the account on its free plan.
2. Run `npx wrangler@4 d1 create sharethecost`. Copy the returned database ID into `wrangler.toml`.
3. Run `npx wrangler@4 d1 migrations apply sharethecost --remote`.
4. Run `npx wrangler@4 pages project create sharethecost --production-branch main`. If that name is already taken, use an available project name in the command and in `wrangler.toml`.
5. Add a Turnstile widget for the production hostname and any preview host you plan to use. Set `TURNSTILE_SITE_KEY` as a Pages environment variable, and store `TURNSTILE_SECRET` and a randomly generated `ADMIN_PASSWORD` as encrypted Pages secrets. Keep `LOCAL_DEV` unset in Pages.
6. Deploy from this directory with `npx wrangler@4 pages deploy dist --project-name sharethecost` (use the actual project name). In Pages, add `sharethecost.whenly.org` as a custom domain. If DNS is external, add the CNAME Pages provides at the existing DNS provider.
7. Once HTTPS and Turnstile are active, submit a test proposal from the production domain, approve it, join from a separate browser, verify the public progress and private organizer view, then withdraw and close the test listing. Add the sitemap to Google Search Console after public URLs are ready.

The site records email addresses for organizer coordination. It treats entries as expressions of interest and does not verify email ownership. Public pages never list participant emails. Each participant gets a private management link and needs to save it to change or withdraw their quantity later. Export D1 periodically and keep backups private.
