# Deploy Share the Cost to Cloudflare Pages

Use the existing free Pages project and D1 database named `sharethecost`. The production domain is `sharethecost.whenly.org`.

## Prepare and deploy

1. Run `npm test` with Node.js 24 or later.
2. Sign into Wrangler with `npx wrangler@4 login`. If you need a local D1 configuration, copy `wrangler.toml.template` to `wrangler.toml` and enter the existing D1 database ID. Use the Pages project's current settings if it already has a Wrangler configuration.
3. Confirm that production binds the existing D1 database as `DB`. Set `TURNSTILE_SITE_KEY` and store `TURNSTILE_SECRET` and `ADMIN_PASSWORD` as Pages secrets. The Turnstile widget must allow the production hostname. Keep `LOCAL_DEV` unset in production.
4. Back up D1 before upgrading older data. Apply pending migrations explicitly. Migration 0003 keeps the earliest registration for each case-insensitive email and group buy, including its quantity and private management link, and removes later duplicates.

   ```sh
   npx wrangler@4 d1 migrations apply sharethecost --remote
   ```

5. Deploy from the repository root so Wrangler includes both `dist/` and `functions/`. Use the existing project's production branch, shown here as `main`.

   ```sh
   npx wrangler@4 pages deploy dist --project-name sharethecost --branch main
   ```

## Verify production

Check the homepage, proposal form, `/privacy`, `/terms`, `/robots.txt`, and `/sitemap.xml`. Verify that Turnstile accepts a proposal, an organizer can approve it, and a separate participant can join, update their quantity, and withdraw. Verify that the organizer can publish shipping and pickup details and close the listing. Remove any test data after checking.

Use the site's public contact address to receive privacy requests and reports. Keep personal details out of public updates. Review closed and rejected records periodically and remove contact data once it is no longer needed to coordinate a buy or handle a legitimate follow-up.

Use **Remove listing** in the organizer dashboard to take a reported listing off the public site. Participants can still withdraw through their private links. Turnstile must validate the correct form action before a submission reaches the database. The database rejects reused verification tokens and allows up to 12 verified submits per IP address over 10 minutes across both forms.

See [Cloudflare Pages deployment](https://developers.cloudflare.com/pages/get-started/direct-upload/) and [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).
