# metashelf.dev

A single-page directory of markdown files, deployed as a Cloudflare Worker. Plain JavaScript, locally hosted Geist Mono, and no frontend framework.

## Develop

Use Node.js 22 or newer. Run `npm ci`, copy `.dev.vars.example` to `.dev.vars`, set a long `ADMIN_PASSPHRASE` and a separate random `SESSION_SECRET`, then run `npm run dev`.

`npm test` checks the markdown parser and runs browser/API tests against a local Worker with fresh, isolated KV storage. The browser tests use installed Chrome and create temporary test records at runtime. `npm run check` builds the assets and runs a Wrangler dry run.

## Deploy

Authenticate with `npx wrangler login`. The `FILES` KV namespace and `metashelf.dev` custom domain are configured in `wrangler.jsonc`. Run `npm run deploy`, then set `ADMIN_PASSPHRASE` and `SESSION_SECRET` using `npx wrangler secret put NAME` if they are not already configured. Never commit `.dev.vars`.

Type `help` at the site prompt for commands. Type `sudo` and enter the configured passphrase to edit. Sessions last 24 hours; login is limited to five attempts per minute per IP at each Cloudflare location. `logout` clears the session cookie. Rotate `SESSION_SECRET` to invalidate all sessions.

## Content

The repository contains the application only. There are no bundled projects or content files. A fresh installation has an empty, protected `README.md` and no projects. Use `sudo` on the site to edit README and create projects with `+ new.md` or `new`.

All authored content persists as raw markdown in Cloudflare KV keys named `file:<path>`. Deployments do not seed, overwrite, or restore content. Deleting a project removes its KV record. Do not delete the KV namespace when redeploying. KV changes can take up to 60 seconds to propagate to other Cloudflare locations; successful edits appear immediately in the editing browser.

`GET /api/files` exports all current `{path, raw}` records, and `/<path>.md` serves each raw file directly. The admin editor supports arbitrary JSON string tags, inline validation, and Ctrl/Cmd+Enter to save. README is editable but cannot be deleted.

Local test screenshots are ignored under `.artifacts/`.
