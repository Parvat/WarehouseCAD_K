# Trace — Platform Plan (backend, accounts, saving, sharing, payments)

Status: PLANNED, not started. Finish the layout/canvas work first. This doc captures
the decisions and open questions so building can start cleanly later.

---

## 1. Backend decision: Supabase (managed)

**Why:** almost all of Trace's heavy work (generator, drawing, PDF export) runs in the
browser. The backend only has to store accounts, projects, versions and settings,
handle login, and pass comments around. Supabase provides all of that out of the box:
Postgres database, authentication (email/password, Google, magic links), row-level
security rules, file storage, and real-time updates (for live comments).

**Cost (checked Sept 2026, verify at build time):**
- Development/testing: Free tier. Free projects pause after 7 days of inactivity, so
  never for real customers.
- Launch: **Pro, $25/month + usage** (8 GB database, 100K monthly active users, 100 GB
  storage). Compute is billed separately; realistic total ~$60/month.
- Later, only if an enterprise buyer requires it: **Team, $599/month** — gives SOC 2 /
  ISO 27001 reports for the Supabase part, SSO/SAML ("log in with your company
  account"), 14-day backups. A very large customer may also want Trace's OWN SOC 2
  (separate process, months, several thousand dollars) — only when a deal needs it.

**Alternatives considered:** own server (Spring Boot + Postgres) — full control, no
lock-in, but months of plumbing (login, sessions, storage, realtime, security) before
any feature. Revisit only at very large scale or for on-premise customers.

---

## 2. Heavy work: where it runs

- **Generator, drawing, PDF:** in the browser. Each user brings their own computing
  power, so thousands of users put zero load on the servers. Nothing to load-balance.
- **Supabase Edge Functions:** only for short, light tasks (webhooks, emails, checks).
  They have strict time/memory limits; not for heavy jobs.
- **Heavy server jobs, if ever needed** (DWG import, scanned-PDF import, batch jobs):
  a separate worker service on an auto-scaling platform (e.g. Google Cloud Run, AWS).
  Flow: browser uploads to Supabase → worker is triggered → does the work → writes the
  result back to Supabase. It scales up automatically under load and down to zero when
  idle. DXF import may be doable in the browser, so a worker may only be needed for DWG
  or scanned PDFs.

---

## 3. Rules from day one (keep a future migration cheap)

If Trace later moves off Supabase (own server, or self-hosted Supabase as a middle
step), these rules keep it to a few weeks instead of months:

1. **One place in the app talks to Supabase:** a `data/` folder with functions like
   `saveProject()`, `loadProject()`, `listVersions()`, `addComment()`. The rest of the
   app never calls Supabase directly. A migration rewrites that folder, not the app.
2. **Business logic stays in the app,** not in database triggers or Supabase-specific
   functions.
3. **Layouts are stored as files** (the `.trace` format) in Storage; the database only
   holds the list of projects, versions, users, settings and comments. Files move
   trivially.
4. **Standard login methods only** (email/password, Google). Nothing Supabase-only.

Migration difficulty by part: database — easy (plain Postgres dump/restore); files —
easy (S3-style copy); security rules — medium (reference Supabase's login user); live
comments — medium (swap to WebSockets); login/accounts — hardest (export users and
password hashes; the new server must take over sessions and resets).

Middle step: Supabase is open source and can be self-hosted on your own servers with no
app changes.

---

## 4. Build order (when this starts)

1. **Routing + login session.** Real URLs (`/login`, `/projects`, `/projects/:id`);
   the session is remembered so refresh keeps the user where they were. (Today refresh
   goes back to login.)
2. **Accounts + database.** Users, companies (if multi-user), projects, user settings.
3. **Save/load: cloud + local.** Cloud is the main copy, with autosave. Plus
   Export/Import a `.trace` file for local backups or offline work.
4. **Versioning.** Every save keeps a snapshot; named versions ("Sent to customer
   v2"); restore an old version.
5. **Hosting.** Staging + live sites, own domain, HTTPS. Can run alongside 2–4.
6. **Share link + comments (Figma-style).** Dealer creates a link; the customer opens
   it view-only and drops comment pins on the layout; the dealer sees them live,
   replies, resolves. Links can expire and be revoked.
7. **Payments.** Stripe subscriptions, trials, plan limits (the "is paid" check at each
   paid feature). Stripe holds card data; Trace never stores it.

**Security** is part of each step, not a separate one: login and password rules (2),
per-company data access rules (2), expiring/revocable share links (6), HTTPS and
backups (5), Stripe for card data (7).

---

## 5. Open questions (answer before building)

1. **Accounts:** one login per dealer, or companies with several users (e.g. a
   dealer's salespeople sharing projects)?
2. **Customers on a share link:** view + comment without an account, or must sign up?
3. **Pricing model (rough):** per user per month, per company, or per project? Shapes
   how accounts are structured, even though payments come last.

---

## 6. Current layout work

Needs none of this. The canvas, generator and editing tools run entirely in the
browser and keep working as they are. The only thing to keep in mind meanwhile: all
layout data should stay inside the saved layout (the `.trace` / scene save), not in
side storage, so it can be uploaded to the cloud later without changes.
