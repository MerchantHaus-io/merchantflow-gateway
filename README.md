# MerchantFlow Gateway

React + Vite + TypeScript dashboard backed by Supabase. The app manages opportunities, accounts, contacts, and onboarding documents for MerchantFlow.

## Prerequisites
- Node.js 18+ and npm
- Access to a Supabase project with the required tables
- Netlify account (for deployment)

## Local Setup
1. Install dependencies:
   ```sh
   npm install
   ```
2. Copy the example environment file and add your Supabase values (the checked-in defaults point at the hosted demo backend so the app still works out of the box):
   ```sh
   cp .env.example .env
   ```
3. Start the development server:
   ```sh
   npm run dev
   ```
4. Run checks before committing:
   ```sh
   npm run lint
   npm run build
   ```

### Environment Variables
| Name | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL. Defaults to the hosted demo URL if unset. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon (public) API key. Defaults to the hosted demo key if unset. |

Store production credentials only in local `.env` files or your hosting provider. For Netlify, configure them under **Site settings → Environment variables** so they override the bundled demo defaults and are injected at build time without committing secrets.

## Supabase Notes
- Storage downloads now use short-lived signed URLs (`createSignedUrl`) to avoid exposing public file links.
- Database queries fetch only the columns needed by the UI to reduce payload size.

## Data Fetching
A global `QueryClientProvider` for `@tanstack/react-query` is already wired up in `src/App.tsx`. Prefer React Query for future data fetching to gain caching, background refreshes, and consistent loading/error handling.

## Deployment (Netlify)
1. Push changes to GitHub.
2. In Netlify, create a new site from your repository.
3. Set the environment variables listed above.
4. Use the default build command `npm run build` and publish directory `dist` (configured in `netlify.toml`).

## Continuous Integration
GitHub Actions will lint and build the project on each push to validate changes before deployment.
