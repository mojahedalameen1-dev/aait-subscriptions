# AAIT Subscriptions

نظام داخلي أحادي الشركة لإدارة اشتراكات AAIT وطلبات الموظفين والتجديدات والصلاحيات.

## Stack

- React 19, Vite, TypeScript, Tailwind CSS v4 and shadcn/ui (Radix base)
- TanStack Query, Zustand and Recharts
- Firebase Authentication (Google only) and Firestore
- Vercel Functions for privileged operations on the free Hobby plan
- IBM Plex Sans Arabic with full RTL support

## Local development

1. Copy `.env.example` to `.env.local` and fill the Firebase web app values.
2. Run `npm install`.
3. Run `npm run dev`.

## Secure server configuration

The Vercel project requires two encrypted environment variables:

- `FIREBASE_SERVICE_ACCOUNT`: compact JSON for the dedicated Firebase Admin service account.
- `CREDENTIALS_KEY`: a random 32-byte key encoded as Base64.

Never commit either value. Sensitive actions are implemented in `api/actions.ts`, including request approval/rejection, subscription mutations, role assignment, credential encryption/reveal, notifications and audit logging. Encrypted credential payloads live in the server-only `credentials` collection; assigned employees can reveal only the credential of their own subscription after confirmation, while global access still requires the atomic reveal permission.

Firebase remains on the Spark plan. Firebase Cloud Functions are intentionally not configured because deploying them would require the paid Blaze plan.

## Verification

```bash
npm run build
npm run lint
```

Production: https://aait-subscriptions.vercel.app

Firebase Hosting mirror: https://aait-subscriptions-2026.web.app
