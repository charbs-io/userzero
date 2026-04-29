# User Zero

User Zero is a Nuxt 4 and Nuxt UI app for AI-powered QA/customer simulation. Users sign in with GitHub, verify ownership of a domain, start a browser run against a verified URL, and review screenshots, issues, trace steps, and a markdown report.

## Stack

- Nuxt 4
- Nuxt UI dashboard template
- Supabase Auth, Postgres, and Storage
- Playwright Chromium
- OpenAI Responses API with image input and structured output
- Railway Docker deployment

## Setup

Install dependencies and the Chromium browser used by the QA runner:

```bash
pnpm install
pnpm setup:browsers
```

Copy `.env.example` to `.env` and set:

```bash
NUXT_PUBLIC_APP_BASE_URL=http://localhost:3000
NUXT_PUBLIC_SUPABASE_URL=
NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
API_KEY_ENCRYPTION_SECRET=
```

Apply the Supabase migration in `supabase/migrations`.

OpenAI API keys are saved per user from the Setup page. `API_KEY_ENCRYPTION_SECRET` must be a high-entropy server-only secret of at least 32 characters, for example the output of `openssl rand -base64 32`. Keep this value stable; changing it makes saved API keys undecryptable.

Enable GitHub in Supabase Auth and configure:

- GitHub OAuth callback: `https://<project-ref>.supabase.co/auth/v1/callback`
- Supabase redirect URL: `http://localhost:3000/auth/callback`
- Production redirect URL: `https://<your-domain>/auth/callback`

## Development

```bash
pnpm dev
```

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Domain Ownership

Users must verify a domain before testing it. User Zero accepts either:

```html
<meta name="userzero-site-verification" content="uzv_<token>">
```

or:

```txt
_userzero.example.com TXT "userzero-site-verification=uzv_<token>"
```
