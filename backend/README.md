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
7. Uploads require valid JPEG, PNG, or WebP images no larger than 5 MB. Profile, Lost & Found, and marketplace forms run an on-device image check; it is client-side and can be bypassed. Lost & Found report details are entered manually; photos are screened and visually matched before upload. Lost & Found visual matching uses MobileNet V1 and needs a one-time browser model download. Posts without an embedding are retried in batches of 10 when their owner visits Lost & Found and the model is available. Similarity is calculated on the server against active posts with the same status, category, and college. At 88% or higher, publishing asks for a 15-character explanation; overrides are capped at three per account per 24 hours and appear in the admin moderation queue. Lower scores do not interrupt publishing. Deferred same-status scans at 98% or higher notify the reporting owner; opposite-status matches at the 70% suggestion threshold notify the other post's owner. These notices never hide or delete posts. Migrations `016_lost_found_match_notifications.sql`, `017_lost_found_duplicate_overrides.sql`, and `024_lost_found_match_notification_pair_unique.sql` support matching and notices. Migration `018_admin_console.sql` enables the `/admin` console, account session revocation, campus metadata, emergency controls, and immutable admin audit logging. Migration `019_admin_password_auth.sql` adds the additional hashed admin password and 30-minute revocable admin sessions; migrations `020_admin_audit_schema_compat.sql` and `021_admin_audit_action_type.sql` reconcile audit-log columns for existing deployments. Migration `022_account_support_requests.sql` enables unauthenticated support requests for people locked out of accounts and the password-protected admin support inbox. Migration `023_web_push_subscriptions.sql` stores opted-in device subscriptions. From `backend/`, generate a VAPID key pair with `npx web-push generate-vapid-keys` and set `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_VAPID_SUBJECT` on the backend to enable push. Run `npm run db:migrate` before deploying the updated server. After granting the `admin` role to a verified account, open `/admin` and set a separate 14+ character password on first use. Bans can be reversed by an admin, but removed listings and photos are not restored. Suspended or banned users can use `/support`; administrators can review requests in the console and reply by email. Never share the admin account with students. Roll numbers are optional at sign-up. Client-side NSFWJS results are untrusted and are not shown as an image-review queue; trustworthy server-side screening is not currently configured. Server endpoints screen user-submitted text against word lists for English, Arabic, German, Spanish, French, Hindi, Korean, Russian, Mandarin Chinese, and Brazilian Portuguese, and reject unsupported writing systems. Word lists cannot guarantee detection of every phrase or evasion in every language.
8. Sign up, accept the Code of Conduct, read the OTP from the server console (no SMTP configured in development),
   verify, then `npm run make-admin -- you@example.com` for your own account.

## Trust and item badges
College Verified requires a verified address on the approved college email domain. Power Trader requires
at least two completed handovers and no pending reports against that user's posts. Lost-item posters can
mark a report urgent; a Found report cannot be marked urgent. Verified Match is reserved for claims whose
handover code has been successfully redeemed. Pending reports and moderation flags are shown only to the
post owner and admins; other students do not see those posts while they are under review. Migration
`025_lost_found_urgent_badge.sql` adds the stored urgent flag. Migration
`026_admin_badge_overrides.sql` enables audited admin overrides for account and post badges. Overrides
do not change permissions, verification, or lifecycle state; assigning Under Moderation Review also
hides the post from other students and blocks related actions until cleared. Migration
`027_barter_search_alerts.sql` adds per-listing wanted categories, saved marketplace searches, and
in-app alerts. Barter loops are non-binding same-college suggestions. Search alerts can also use
browser push when push is configured. Migration `028_phase_one_student_core.sql` adds the same-college
Need Board, category/branch criteria for saved searches, and quiet-hour preferences. Search alerts explain
their keyword/category/branch matches; quiet hours pause push only, while in-app alerts remain immediate.
Migration `029_automatic_search_alerts.sql` adds the default-on automatic search tracking preference
and distinguishes automatic search history from alerts a student explicitly saves. Students can disable
new tracking or delete automatically tracked searches from Profile settings. Apply migrations
through `npm run db:migrate` before deploying backend code that depends on the new schema. Migration
`030_user_blocks.sql` adds account blocking. Blocking hides each account’s posts and conversations from
the other, prevents new messages, reservations, claims, and barter loops, and cancels pending reservations
and Lost & Found claims. Students can review and undo their own blocks under Profile → Safety & Privacy.
The Need Board supports expiring requests, private replies, available-listing offers, and clearly labeled
non-binding loan offers. `/api/search` combines available marketplace listings, active Lost & Found
reports, and open Need Board requests without exposing posts hidden for moderation. Achievements use
recorded listings, completed marketplace handovers, verified Lost & Found returns, and Need Board activity;
the system does not fabricate XP or count a suggested barter loop as a completed trade.

## Endpoints
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /api/search?q= | session cookie | Campus-wide search across marketplace, active Lost & Found, and open Need Board records |
| GET, POST | /api/search-alerts/saved | session cookie, active | List or save keyword alerts; optional category_id and branch_id |
| POST | /api/search-alerts/track | session cookie, active | Automatically track a successful search when the user has enabled automatic alerts |
| DELETE | /api/search-alerts/automatic | session cookie, active | Delete all automatically tracked search terms and their related alerts |
| DELETE | /api/search-alerts/saved/:id | session cookie, active | Remove one of your saved alerts |
| GET, PATCH | /api/search-alerts/preferences | session cookie, active | Read or update quiet hours and automatic search tracking preference |
| GET | /api/blocks | session cookie, active | List accounts you have blocked |
| POST | /api/blocks/:userId | session cookie, active | Block an account and cancel pending interactions |
| DELETE | /api/blocks/:userId | session cookie, active | Unblock an account |
| GET, POST | /api/needs | session cookie, active | Browse same-college requests or post a request with an expiry |
| GET | /api/needs/:id | session cookie, active | View an open request; private responses are returned only to its owner |
| POST | /api/needs/:id/responses | session cookie, active | Send one private listing or non-binding loan offer |
| PATCH | /api/needs/:id/status | session cookie, active | Request owner marks an open request fulfilled or closed |
| GET | /api/achievements | session cookie | Recorded activity totals and achievement progress |
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
| GET | /api/admin/users/:id | admin | Account details, active posts with photos/descriptions, and received reports |
| POST | /api/admin/posts/:type/:id/remove | admin | JSON `{ "reason": "..." }`; removes one marketplace or Lost & Found post, deletes its photos, rejects pending claims, and writes an audit entry |
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
- Migrations `028_phase_one_student_core.sql` and `029_automatic_search_alerts.sql`, along with their query paths, still need validation against a scratch PostgreSQL database before production rollout.
