# ShipView Headless Tracker

ShipView is now a small headless DTDC tracking app:

- Customer tracker: `http://127.0.0.1:4173`
- Private admin dashboard: `http://127.0.0.1:4173/admin`
- Server-side API bridge: `/api/track`
- Package storage: `data/packages.json`

The browser never receives the DTDC API key. The key belongs in `.env` later.

## Start It

Open this folder in VS Code, open the terminal, then run:

```powershell
npm start
```

Then open:

```text
http://127.0.0.1:4173
```

## Admin Login

The starter password is:

```text
shipview-admin
```

Before putting this online, create `.env` from `.env.example` and change:

```text
ADMIN_PASSWORD=your_private_password
```

## Add DTDC Later

When DTDC gives you the API key and endpoint, put them in `.env`:

```text
DTDC_API_KEY=your_real_key_here
DTDC_API_URL=the_real_dtdc_tracking_endpoint
```

The admin dashboard can add, remove, update status, and refresh packages. Without a DTDC key, refresh stays in demo mode. With a key, refresh calls DTDC from the server.
