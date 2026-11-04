# CampusKit backend (step 1: sign-up, OTP login, item listing, photo upload)

Node 20+ / Express 5 / PostgreSQL 13+. No passwords are stored: login is by emailed 6-digit code.

## Folder structure
```
campuskit/
  db/
    schema.sql              # v2 schema (your version)
    tests/test_flows.sql           # v2 rules (run in a SCRATCH database only: it inserts fake rows)
    tests/test_multi_college.sql   # college rules (scratch database only)
    migrations/003_multi_college.sql   # many colleges on one platform
    reference-data.json     # 15 general branches, categories, item types (same for every college)
  backend/
    .env.example  package.json
    src/ server.js app.js config.js db.js email.js storage.js
         middleware/ auth.js errorHandler.js
         routes/ auth.js items.js meta.js
         utils/ otp.js images.js semester.js errors.js
    scripts/ init-db.js seed-reference.js make-admin.js
```

## Putting it online instead of running on your PC
See `../DEPLOY.md` (free-tier plan: Supabase + Render + Brevo).

## Run it on your own PC (needs PostgreSQL installed)
1. Create an empty PostgreSQL database and a user for it.
2. `cd backend && cp .env.example .env`, then fill DATABASE_URL, JWT_SECRET, OTP_SECRET
   (generate each with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
3. `npm install`
4. `npm run db:init`          (new empty database: base schema + migrations). Existing database: `npm run db:migrate`
5. `npm run db:seed`          (general branches, categories, item types), then add your college: see DEPLOY.md Step 4.
6. `npm run dev`
7. Uploads require valid JPEG, PNG, or WebP images no larger than 5 MB. Profile, Lost & Found, and marketplace forms run an on-device image check; it is client-side and can be bypassed. Lost & Found visual matching uses MobileNet V1 and needs a one-time browser model download. Posts without an embedding are retried in batches of 10 when their owner visits Lost & Found and the model is available. Similarity is calculated on the server against active posts with the same status, category, and college. At 88% or higher, publishing asks for a 15-character explanation; overrides are capped at three per account per 24 hours and appear in the admin moderation queue. Lower scores do not interrupt publishing. Deferred scans at 98% or higher notify the owner but never automatically hide or delete posts. Apply migrations `016_lost_found_match_notifications.sql` and `017_lost_found_duplicate_overrides.sql` before deploying this behavior. Migration `018_admin_console.sql` enables the `/admin` console, account session revocation, campus metadata, emergency controls, and immutable admin audit logging. Migration `019_admin_password_auth.sql` adds the additional hashed admin password and 30-minute revocable admin sessions; migration `020_admin_audit_schema_compat.sql` reconciles audit-log columns for existing deployments. Run `npm run db:migrate` before deploying the updated server. After granting the `admin` role to a verified account, open `/admin` and set a separate 14+ character password on first use. Never share that admin account with students. Roll numbers are optional at sign-up. Client-side NSFWJS results are untrusted and are not shown as an image-review queue; trustworthy server-side screening is not currently configured. Server endpoints screen user-submitted text against word lists for English, Arabic, German, Spanish, French, Hindi, Korean, Russian, Mandarin Chinese, and Brazilian Portuguese, and reject unsupported writing systems. Word lists cannot guarantee detection of every phrase or evasion in every language.
8. Sign up, accept the Code of Conduct, read the OTP from the server console (no SMTP configured in development),
   verify, then `npm run make-admin -- you@example.com` for your own account.

## Endpoints
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /health | no | |
| GET | /meta | no | branches, categories, item types |
| GET | /colleges?q= | no | approved colleges for the sign-up picker |
| POST | /auth/signup | no | JSON: email, full_name, display_name, conduct_accepted: true, **college_id or new_college{name,city,state?}**, branch_id or branch_other, admission_year? |
| POST | /auth/login | no | JSON: email |
| POST | /auth/verify | no | JSON: email, code -> `{ user }`; sets an HttpOnly session cookie |
| POST | /auth/logout | no | Clears the HttpOnly session cookie |
| GET | /auth/me | session cookie | profile, college, trust, derived current_semester |
| GET | /items?limit= | Bearer | newest available listings at YOUR college |
| POST | /items | session cookie, active | multipart: title, condition, price, item_type_id or category_id, optional description/branch_id/semester/preferred_place, 1-5 JPEG/PNG/WebP files in `photos` (5 MB each; images are validated and re-encoded before storage; text is moderated server-side) |
| POST | /moderation/reports | session cookie, active | JSON: item_type (`marketplace` or `lost_found`), item_id, reason |
| GET | /moderation/admin/reports | admin | Pending content reports |
| PATCH | /moderation/admin/reports/:id | admin | JSON action: `dismiss`, `remove`, or `ban`; removal also deletes stored photos |
| GET | /items/mine | Bearer | |
| GET | /items/:id | Bearer | 404 if the item belongs to another college |

## What was verified by running it (PostgreSQL 16, Node 22)
Sign-up/verify/login; same reply for unknown emails; resend cooldown; code single-use; lock after 5 wrong tries;
tampered token rejected; photo with GPS EXIF stored as WebP with all metadata removed; fake image rejected;
no-photo rejected; price cap and active-listing cap for untrusted users; frozen account can browse but not list;
no orphan files after failures.

## NOT verified / still to do
- Real email sending (SMTP). Only the console path was exercised. Check your provider's current free limits and terms.
- Pending (student-added) colleges are never cleaned up automatically; an unverified sign-up can leave a junk pending college behind. Needs a scheduled cleanup.
- Semester is derived assuming odd semesters start in July (ODD_SEMESTER_START_MONTH). Check your college calendar.
- Sessions are 7-day Bearer tokens with no refresh/logout-everywhere. Fine for now; revisit before the mobile app.
- Photos are on local disk and publicly readable by URL (unguessable names, but not private). Move to a bucket when you deploy.
- Nothing runs `expire_stale_reservations()` yet (needs a scheduled job, comes with the reserve flow).
- The moderation classifier and upload gate have unit tests (`npm test`); full authenticated endpoint flows still need an integration test against a scratch PostgreSQL database.
