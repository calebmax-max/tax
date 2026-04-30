# Supabase Setup

This app works locally without Supabase, but cloud accounts need a Supabase project.

## 1. Create Project

1. Go to Supabase.
2. Create a new project.
3. Open **Project Settings > API**.
4. Copy:
   - Project URL
   - anon public key

## 2. Add Environment Variables

Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Restart the app after adding these.

## 3. Run Database Schema

Open **SQL Editor** in Supabase and run everything inside:

```text
supabase/schema.sql
```

This creates one secure `app_data` table per user. Row Level Security ensures users only read and update their own data.

## 4. Test Cloud Sync

1. Open the app.
2. Go to **Settings**.
3. Tap **Sign In / Create Account**.
4. Create an account with email and password.
5. Tap **Save to Cloud**.
6. Refresh the app or sign in on another browser.

Your invoices, expenses, customers, business settings, and tax settings should load from the cloud.

## Troubleshooting

### Email rate limit exceeded

This happens when Supabase sends too many confirmation emails during testing.

For local testing, you can temporarily disable email confirmation:

1. Open Supabase.
2. Go to **Authentication > Providers > Email**.
3. Turn off **Confirm email**.
4. Save changes.
5. Try creating the account again.

For production, keep email confirmation on and connect a proper SMTP provider so email limits are higher and delivery is reliable.

## Current Cloud Model

The app stores each user's business data as one JSON payload. This is fast for an MVP and simple to maintain.

Later, when the product grows, split the data into separate tables:

- businesses
- customers
- invoices
- invoice_items
- expenses
- receipts
- payments

That future structure will support analytics, teams, audit logs, and payment reconciliation.
