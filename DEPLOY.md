# Putting CampusKit online (free tiers) - no PostgreSQL on your PC needed

IMPORTANT, read first:
- This puts the **API** online. There is **no website yet** (React comes next), so for now you test with
  a browser address bar and a tool like Postman/Thunder Client. "Everyone can use it" needs the frontend too.
- Free tiers change and have catches. The numbers below were what I found in public comparisons
  (Sept/Oct 2026). **Check each provider's pricing page yourself before relying on it.**
- I could not log in to Supabase, Render or Brevo, so button names below may differ slightly.
  Where I am not sure, I say so. Do not skip those checks.

## What you will use
| Job | Service | Why |
|---|---|---|
| Database + photo storage | Supabase | one account gives Postgres and an S3-compatible bucket |
| Running the API | Render (free web service) | runs Node; sleeps when idle (first request after a break takes ~1 min) |
| Sending OTP emails | Brevo (SMTP) | free plan advertised at 300 emails/day |
| Code storage | GitHub | Render deploys from it |

## Step 1 - GitHub
1. Create a free GitHub account and a **private** repository named `campuskit`.
2. In your `campuskit` folder (the one containing `backend/`, `db/`, `render.yaml`):
   ```
   git init
   git add .
   git commit -m "CampusKit step 1"
   git branch -M main
   git remote add origin https://github.com/YOUR_NAME/campuskit.git
   git push -u origin main
   ```
3. Check on GitHub that **no `.env` file** was uploaded. If one was, delete it and change every secret in it.

## Step 2 - Supabase (database + photos)
1. Create a project. Pick the region closest to your users (for India, check which regions Supabase offers).
   Save the **database password** you choose; you cannot see it again.
2. Database connection string: in the project's Connect / Database settings, copy the connection string.
   **Not sure:** the "direct" string may only work over IPv6, which some hosts do not support. If Render cannot
   connect, use the "session pooler" string from the same page. Replace `[YOUR-PASSWORD]` with your password.
3. Photo bucket: Storage -> New bucket -> name `item-photos` -> make it **public**.
4. Storage S3 credentials: in the project's Storage settings, find the S3 connection section and create an
   access key. Copy: endpoint, region, access key ID, secret. Treat the secret like a password.
5. Public photo address (you build it): `https://<project-ref>.supabase.co/storage/v1/object/public/item-photos`
   Open one uploaded photo later and confirm the address really starts like this. This is `S3_PUBLIC_BASE_URL`.

Free-tier catch (from comparisons I read): Supabase pauses free projects after about a week of inactivity.
A paused project means your site is down until you un-pause it in the dashboard. Before any demo, open the dashboard and check.

## Step 3 - Brevo (email)
1. Create an account. In SMTP & API settings, create an SMTP key. Note the SMTP server, port, login and key.
   (I believe the server is `smtp-relay.brevo.com`, port 587. Confirm on their page.)
2. Add and verify a **sender address** (the email OTPs come from). Using a plain @gmail.com sender with a
   relay can fail anti-spoofing checks, so ask your guide/college whether a college or project address is possible.
   Test by sending yourself a code before demo day.
3. Free limit is per day. At 300/day, 100 new students signing up on one day is fine; a launch-day rush is not.

## Step 4 - Create the tables from your PC (no local Postgres needed)
1. In `backend/`, copy `.env.example` to `.env` and fill ONLY these for now:
   ```
   DATABASE_URL=<your database connection string>
   DATABASE_SSL=true
   JWT_SECRET=<any long random text, 32+ characters>
   OTP_SECRET=<another long random text>
   ```
   Leave the S3 and SMTP lines empty. (This `.env` is only so the commands below work. Never commit it.)
2. Run:
   ```
   npm install
   npm run db:init        # brand-new EMPTY database: base schema + all migrations
   npm run db:migrate     # database that already has the base schema: applies only the new migrations
   npm run db:seed        # 15 general branches, categories, item types (the same for every college)
   ```
   Use `db:init` OR `db:migrate`, not both. `db:migrate` is safe to repeat.
3. Add your first college (the platform is multi-college; students pick theirs at sign-up). In the Neon SQL editor:
   ```sql
   INSERT INTO colleges (name, city, state, email_domain, status)
   VALUES ('YOUR COLLEGE NAME', 'YOUR CITY', 'YOUR STATE', NULL, 'approved');
   -- email_domain: put 'college.ac.in' (no @) ONLY if your college really issues student emails.
   -- If set, only that domain can sign up for this college. Leave NULL otherwise.
   ```
4. Colleges that students add themselves arrive as 'pending'. They work for their own members but are not shown
   in the public list. Review them in the SQL editor:
   ```sql
   SELECT id, name, city, created_at FROM colleges WHERE status = 'pending';
   UPDATE colleges SET status = 'approved' WHERE id = 3;     -- real college: list it publicly
   UPDATE colleges SET status = 'rejected' WHERE id = 4;     -- junk: new sign-ups can no longer use it
   ```
   Near-duplicates ("ABC College" vs "A.B.C. College") are NOT merged automatically; merging is manual for now.

## Step 5 - Render (the API)
Option A (blueprint): Render dashboard -> New -> Blueprint -> pick your GitHub repo. It reads `render.yaml`.
Option B (by hand): New -> Web Service -> your repo, then set:
- Root directory: `backend`   Build command: `npm ci`   Start command: `npm start`
- Instance type: Free   Health check path: `/health`
Environment variables (both options; secrets are typed into Render, never into the repo):
```
NODE_ENV=production            TRUST_PROXY=1             DATABASE_SSL=true
DATABASE_URL=...               JWT_SECRET=... (32+ chars)  OTP_SECRET=... (32+ chars)
PUBLIC_BASE_URL=https://<your-render-name>.onrender.com
CORS_ORIGIN=                    (the website address, once you have one)
SMTP_HOST=...  SMTP_PORT=587  SMTP_USER=...  SMTP_PASS=...  MAIL_FROM="CampusKit <your-verified-sender>"
S3_BUCKET=item-photos  S3_REGION=...  S3_ENDPOINT=...  S3_ACCESS_KEY_ID=...  S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_BASE_URL=https://<project-ref>.supabase.co/storage/v1/object/public/item-photos
```
The API refuses to start in production if email, bucket or strong secrets are missing. That is deliberate:
read the Render log for the exact missing name.

## Step 6 - Check it works
1. Open `https://<your-render-name>.onrender.com/health` -> `{"ok":true}` (first load may take ~1 minute).
2. Open `/meta` -> your real branches/categories/spots.
3. Sign up with a real email (Postman: POST `/auth/signup`), read the code from the email, POST `/auth/verify`,
   then create a listing with a photo (POST `/items`, form-data). Open the returned photo link in a browser.
4. Make yourself admin: temporarily point your local `.env` DATABASE_URL at Supabase and run
   `npm run make-admin -- you@example.com`.

## Free-tier habits you must have
- Render free web services sleep after idle time; open `/health` a few minutes before any demo.
- Supabase may pause on inactivity; log in and check weekly.
- You control your data: take a database backup regularly (Supabase dashboard backups if your plan has them, or `pg_dump`).
  Do not assume a free plan keeps backups.
- When real students' data is in the tables you are holding personal data on servers you do not own.
  Ask your guide what notice/consent the college or university expects. Do not guess at the law.
