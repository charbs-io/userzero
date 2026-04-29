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

Install dependencies:

```bash
pnpm install
```

Copy `.env.example` to `.env` and set:

```bash
NUXT_PUBLIC_APP_BASE_URL=http://localhost:3000
NUXT_PUBLIC_SUPABASE_URL=
NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

Apply the Supabase migration in `supabase/migrations`.

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
