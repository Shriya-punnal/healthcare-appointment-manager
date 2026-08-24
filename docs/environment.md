# Environment Configuration

The managed project receives its core database, OAuth, and JWT configuration from the hosting environment. For a standalone clone, provide the following values through your deployment platform or a local `.env` file that is never committed. This document is intentionally safe to commit and serves as the project’s public environment template; it contains no secret values.

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | Yes | MySQL-compatible connection URL. |
| `JWT_SECRET` | Yes | Session signing and Calendar token encryption key. |
| `FRONTEND_URL` / `BACKEND_URL` | Yes | Application origins for a standalone setup. |
| `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | Docker only | Values consumed by `docker-compose.yml`; use them to build `DATABASE_URL`. |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM` | Optional | Enables an email-delivery adapter. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Optional | Enables Google Calendar OAuth; use the callback `/api/integrations/google/callback`. |

Never put these values in browser-accessible variables. If email or Google configuration is omitted, the application continues to work and marks the integration state accurately as unavailable or retryable.
