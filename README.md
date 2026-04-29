# Product Warden

Product Warden is a Nuxt 4 and Nuxt UI app for AI-powered QA/customer simulation. Users sign in with GitHub, verify ownership of a site, optionally connect a GitHub repo for context, start a browser run against a verified URL, and review screenshots, issues, trace steps, and a markdown report.

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
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_SLUG=
GITHUB_APP_WEBHOOK_SECRET=
```

Apply the Supabase migration in `supabase/migrations`.

OpenAI API keys are saved per user from the Setup page. `API_KEY_ENCRYPTION_SECRET` must be a high-entropy server-only secret of at least 32 characters, for example the output of `openssl rand -base64 32`. Keep this value stable; changing it makes saved API keys undecryptable.

Enable GitHub in Supabase Auth and configure:

- GitHub OAuth callback: `https://<project-ref>.supabase.co/auth/v1/callback`
- Supabase redirect URL: `http://localhost:3000/auth/callback`
- Production redirect URL: `https://<your-domain>/auth/callback`

Create a GitHub App for repository connections. For an organization-owned app, use `https://github.com/organizations/<org>/settings/apps/new`. For a personal-account app, use [personal New GitHub App](https://github.com/settings/apps/new). To manage organization apps later, use `https://github.com/organizations/<org>/settings/apps`.

- GitHub App name: choose a unique name, for example `Product Warden`.
- Homepage URL: your deployed app URL, for example `https://<your-domain>`.
- Post installation setup URL: `https://<your-domain>/api/github/app/callback`
- Webhook URL: `https://<your-domain>/api/github/app/webhook`
- Webhook secret: generate one with `openssl rand -hex 32`, paste it into GitHub, and save the same value as `GITHUB_APP_WEBHOOK_SECRET`.
- Repository permissions: Contents write, Issues write, Pull requests write. Metadata read is included by GitHub.
- Subscribe to events: Installation, Installation repositories.
- Installation target: choose **Only on this account** unless this app needs to be installable by other GitHub accounts.

After creating the GitHub App, set these environment variables:

- `GITHUB_APP_ID`: open the app from your GitHub Apps settings page, then copy the number shown next to **App ID**.
- `GITHUB_APP_PRIVATE_KEY`: in the app settings page, under **Private keys**, click **Generate a private key**. GitHub downloads a `.pem` file. Copy the full file contents into this env var, including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----`. If your host requires a single-line value, replace line breaks with `\n`; the app converts those back at runtime.
- `GITHUB_APP_SLUG`: click **Public page** from the app settings page. The URL will be `https://github.com/apps/<slug>`. Save only the `<slug>` part, for example `product-warden`.
- `GITHUB_APP_WEBHOOK_SECRET`: save the exact random secret you entered in GitHub's **Webhook secret** field.

Do not save these values:

- Client ID
- Client secret
- OAuth callback secret
- Installation ID

For local GitHub App callback or webhook testing, expose your local server with a tunnel and use the tunnel URL in the GitHub App settings.

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

## Site Ownership

Users must verify a site before testing it. Product Warden accepts either:

```html
<meta name="productwarden-site-verification" content="pwv_<token>">
```

or:

```txt
_productwarden.example.com TXT "productwarden-site-verification=pwv_<token>"
```
