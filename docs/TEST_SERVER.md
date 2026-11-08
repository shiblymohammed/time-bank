# Test server setup

How to run the API and admin panel on a hosted server with production settings, using
[docker-compose.server.yml](../docker-compose.server.yml). The audit found the public test server in development mode;
this replaces that setup.

The development `docker-compose.yml`, the QA scripts and mock OTP must never be exposed publicly.

## Before the first deploy

### Firebase console (project owner)

1. **Admin sign-in:** add a Web app to project `indian-time-bank`. Note its API key, auth domain and app ID.
2. **Authorized domains:** under Authentication → Settings, add the admin panel's domain.
3. **SMS:** confirm that the billing plan and daily quota allow real delivery. Until this is confirmed, sign-in by SMS
   is unverified.
4. **Push:** create a service account key with permission to send Cloud Messaging messages. Treat it as a secret.
5. **iOS push:** add the APNs key to Firebase. Without it, iPhones sign in normally but receive no push messages.
6. **Android release:** register the release signing certificate's SHA fingerprints.

### Server `.env`

| Name                                                                      | Value                                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `IMAGE_REPOSITORY`                                                        | GitHub repository in lowercase, such as `owner/time-bank`                  |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`                       | New values, never reused from development                                  |
| `JWT_SECRET`                                                              | Random, at least 32 characters                                             |
| `IDENTITY_FINGERPRINT_SECRET`                                             | Random, at least 32 characters; never change it once members are verified  |
| `DASHBOARD_ORIGIN`                                                        | Public admin panel origin, such as `https://admin.example.org`             |
| `FIREBASE_PROJECT_ID`                                                     | `indian-time-bank`                                                          |
| `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_AUTH_DOMAIN`, `FIREBASE_WEB_APP_ID` | From the Web app above                                                     |
| `FIREBASE_SERVICE_ACCOUNT_JSON`                                           | Service account key on one line                                            |
| `TRUST_PROXY_HOPS`                                                        | Proxies in front of the API: `1` for Nginx alone, `2` with a tunnel or CDN |
| `CREDIT_PAIR_MONTHLY_MINUTES` | Minutes one volunteer and one beneficiary can confirm in 30 days before a coordinator must decide. Default `1200` |
| `NGINX_PORT`                                                              | Host binding for Nginx, such as `127.0.0.1:8080` behind a tunnel           |

`TRUST_PROXY_HOPS` matters. Too low and all users share one rate limit; too high and callers can forge their address.

Nginx here serves plain HTTP, so terminate HTTPS in front of it with a tunnel or load balancer. Never publish it
directly.

## Deploying

Set `IMAGE_TAG` to a released image, then:

```bash
docker compose -f docker-compose.server.yml pull
```

```bash
docker compose -f docker-compose.server.yml run --rm api node apps/api/dist/database/run-migrations.js
```

```bash
docker compose -f docker-compose.server.yml up -d
```

The **Deploy to Production** GitHub workflow does the same after CI passes and takes a database backup first. It needs
the `VPS_*` repository secrets and a configured `production` environment. Take a backup by hand before a manual
migration: the credit-controls migration refuses to roll back once credit activity depends on it.

## Staff email code (second sign-in step)

Coordinators and admins must enter a code emailed to them each time they sign in to the panel.
Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and `MAIL_FROM` in `.env`. Then give the first
Super Admin an email address once (sign in with that phone first, so the account exists):

```bash
docker compose -f docker-compose.server.yml run --rm api node apps/api/dist/database/set-staff-email.js +91XXXXXXXXXX you@example.org
```

Everyone else gets their address from the panel: open the member, then **Staff sign-in email**.
Until email is set up, staff sign-ins only have member powers. `STAFF_SECOND_FACTOR=off` turns the
step off and is for private QA only.

## Backups

Take a backup by hand with the nightly script below. It writes `nightly-<date>.sql.gz` to `/backups`
and keeps 14 days. Run it from root's crontab, every night at 02:30 India time:

```bash
30 21 * * * cd /opt/time-bank && scripts/backup-database.sh >> /backups/backup.log 2>&1
```

Use your deploy folder in place of `/opt/time-bank`. Also copy `/backups` off the server, for
example to object storage: a backup on the same disk is lost with that disk.

### Restore drill

Prove the backups restore, before the pilot and then monthly. The drill restores onto a separate
scratch database, checks it against live and removes it. It only reads the live database.

```bash
scripts/backup-restore-drill.sh
```

With no argument it takes a fresh backup and restores that. To test a backup you already have:

```bash
scripts/backup-restore-drill.sh /backups/nightly-20261108-213000.sql.gz
```

`RESULT: PASS` means the restore ran without one SQL error, every table and migration is there, and
(for a fresh backup) every table has the expected rows. Anything else is `RESULT: FAIL` with the
reason, and the exit code is non-zero. Note the date and result in the pilot checklist.

## Checks after deploying

Replace `$SERVER` with the public origin.

| Check                                       | Expected                                         |
| ------------------------------------------- | ------------------------------------------------ |
| `GET $SERVER/api/health/ready`              | `200`, with the database up                      |
| `POST $SERVER/api/auth/otp/request`         | `503`: test sign-in is off                       |
| `GET $SERVER/api/docs`                      | `404`: API docs are hidden                       |
| `GET $SERVER/api/v1/organizations/manage`   | `401`                                            |
| 31 quick `POST $SERVER/api/auth/firebase`   | `429` once past the limit                        |
| Admin sign-in                               | Real SMS arrives and only staff accounts get in  |
| API logs at startup                         | No warning about `FIREBASE_SERVICE_ACCOUNT_JSON` |
| Offer to a volunteer with the app installed | Push message arrives                             |

## Mobile build for this server

The default Flutter build uses test sign-in. A build for this server must turn that off and point at the server:

```bash
flutter build apk --dart-define=DEV_OTP_LOGIN=false --dart-define=API_BASE_URL=https://api.example.org
```

## Known limits

- Rate limits are counted in each API process, so several instances each apply the limit separately.
- Background jobs run in every API instance. Row locks prevent double processing, so extra instances are safe.
- Push reaches phones in the background. There is no in-app banner while the app is open.
- Coordinators are not yet pushed when a request is escalated; it appears in the admin panel.
