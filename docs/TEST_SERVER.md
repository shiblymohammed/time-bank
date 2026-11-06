# Test server setup

How to run the API and admin panel on a hosted server with production settings, using
[docker-compose.server.yml](../docker-compose.server.yml). The audit found the public test server in development mode;
this replaces that setup.

The development `docker-compose.yml`, the QA scripts and mock OTP must never be exposed publicly.

## Before the first deploy

### Firebase console (project owner)

1. **Admin sign-in:** add a Web app to project `time-bank-34a1c`. Note its API key, auth domain and app ID.
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
| `DASHBOARD_ORIGIN`                                                        | Public admin panel origin, such as `https://admin.example.org`             |
| `FIREBASE_PROJECT_ID`                                                     | `time-bank-34a1c`                                                          |
| `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_AUTH_DOMAIN`, `FIREBASE_WEB_APP_ID` | From the Web app above                                                     |
| `FIREBASE_SERVICE_ACCOUNT_JSON`                                           | Service account key on one line                                            |
| `TRUST_PROXY_HOPS`                                                        | Proxies in front of the API: `1` for Nginx alone, `2` with a tunnel or CDN |
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
