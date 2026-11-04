# Barterman

Barterman is organized as a Vite/React frontend in `frontend/` and an Express API in `server/`.

## Requirements

- Node.js 22 and npm

## Run the frontend

```powershell
cd frontend
npm install
npm run dev
```

The frontend runs on port 8443. To create a production build:

```powershell
npm run build
```

Sign-in uses Firebase Authentication (Google and email/password); Firebase is used for authentication only. Copy `frontend/.env.example` to `frontend/.env` and fill in the `VITE_FIREBASE_*` values from the Firebase console. In development, Vite proxies `/api` to the backend on port 5000.

## Run the backend

```powershell
cd server
npm install
npm run dev
```

The API runs on port 5000 by default. Copy `server/.env.example` to `server/.env` and set:

- `MONGODB_URI`: MongoDB Atlas connection string. All application data is stored in MongoDB. The server exits at startup if it can't connect.
- `FIREBASE_PROJECT_ID`: used only to verify Firebase sign-in tokens.
- `ALLOWED_EMAIL_DOMAINS`: comma-separated college email domains allowed to sign in (empty allows any verified email).
- `DNS_SERVERS` (optional): set to `8.8.8.8,1.1.1.1` if the connection fails with `querySrv ECONNREFUSED`.

- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: listing photos are stored in Cloudinary; MongoDB stores only their URLs and public IDs. Keep the secret server-side only.

API routes live under `/api/v1`:

| Route | Purpose |
|---|---|
| `GET /health`, `GET /auth/config` | Health check; allowed email domains |
| `POST /auth/session` | Create or load the MongoDB user after Firebase sign-in |
| `GET /users/me`, `PUT /users/me` | Read or complete your profile |
| `GET /users/me/listings` | All your listings, any status (Seller Hub) |
| `GET /listings` | Browse active listings (`q`, `type`, `category`, `sort`, `page`, `limit`) |
| `GET /listings/:id` | Listing detail (drafts visible only to their owner) |
| `POST /listings`, `PUT /listings/:id` | Create or update; multipart `data` JSON + up to 10 `photos` (5MB each) |
| `PATCH /listings/:id/status` | Mark sold / rented / exchanged / archived, or relist |
| `DELETE /listings/:id` | Delete the listing and its Cloudinary photos |

## Run both from the repository root

Install the root process runner and the two application dependency sets:

```powershell
npm install
npm run install:all
npm run dev
```

The root `npm run client` command remains available as an alias for the frontend dev server. Use `npm run server` to start only the backend from the root.

## Deploy: website on Firebase Hosting, API on Render

1. **API on Render:** push this repository to GitHub, then in Render choose **New > Blueprint** and select the repo. `render.yaml` creates the `barterman-api` web service from `server/`. Enter `MONGODB_URI` and the three `CLOUDINARY_*` values when prompted. In MongoDB Atlas > Network Access, allow `0.0.0.0/0`, because Render's free plan has no fixed IP.
2. **Point the website at the API:** set `VITE_API_URL` in `frontend/.env.production` to the Render service URL (default `https://barterman-api.onrender.com`).
3. **Website on Firebase Hosting:** sign in to the Firebase CLI with an account that has access to the `bartermanfsd` project, then run `firebase deploy --only hosting` from the repository root. `firebase.json` builds `frontend/` first and serves `frontend/dist` with SPA routing. The site is served at `https://bartermanfsd.web.app`, which Firebase Authentication allows by default.

Render's free plan sleeps when idle, so the first request after a quiet period can take about 30 seconds.

## Build and deploy

Run `npm run build` from the repository root to install the frontend dependencies and build `frontend/dist`. The root `netlify.toml` publishes that build output.
