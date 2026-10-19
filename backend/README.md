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
7. Sign up, read the OTP from the server console (no SMTP configured in development),
   verify, then `npm run make-admin -- you@example.com` for your own account.

## Endpoints
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /health | no | |
| GET | /meta | no | branches, categories, item types |
| GET | /colleges?q= | no | approved colleges for the sign-up picker |
| POST | /auth/signup | no | JSON: email, full_name, display_name, **college_id or new_college{name,city,state?}**, branch_id or branch_other, admission_year? |
| POST | /auth/login | no | JSON: email |
| POST | /auth/verify | no | JSON: email, code -> `{ token, user }` |
| GET | /auth/me | Bearer | profile, college, trust, derived current_semester |
| GET | /items?limit= | Bearer | newest available listings at YOUR college |
| POST | /items | Bearer, active | multipart: title, condition, price, item_type_id or category_id, optional description/branch_id/semester/preferred_place, 1-5 files in `photos` |
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
- No automated Node tests yet; everything above was checked by hand with curl.
