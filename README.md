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

See [the Cloudflare Pages deployment guide](DEPLOYMENT.md).

The site records email addresses for organizer coordination. It treats entries as expressions of interest and does not verify email ownership. Public pages never list participant emails. Each participant gets a private management link and needs to save it to change or withdraw their quantity later. Export D1 periodically and keep backups private.
