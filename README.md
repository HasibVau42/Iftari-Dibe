# Kushtia Iftari Tracker - Deployment Instructions for Vercel

This application is built with **Vite (Frontend)** and **Express (Backend)**. To deploy it on Vercel, follow these steps:

## 1. Prepare your code
Ensure you have your code pushed to a **GitHub** repository.

## 2. Vercel Configuration (`vercel.json`)
Since this app uses an Express backend, you need a `vercel.json` file in the root directory to tell Vercel how to handle the API routes and the frontend.

Create a file named `vercel.json` in the root folder with this content:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.ts",
      "use": "@vercel/node"
    },
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": { "distDir": "dist" }
    }
  ],
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/server.ts"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

## 3. Deployment Steps on Vercel Dashboard
1. Go to [Vercel](https://vercel.com/) and click **"Add New"** > **"Project"**.
2. Import your GitHub repository.
3. In the **Build & Development Settings**:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. In the **Environment Variables** section, add the following:
   - `OPENAI_API_KEY`: Your OpenAI API Key.
   - `GEMINI_API_KEY`: Your Gemini API Key.
   - `NODE_ENV`: `production`
5. Click **Deploy**.

## ⚠️ Important Note on Database (SQLite)
This app uses `better-sqlite3` which saves data to a local file (`iftar_events.db`). 
**Vercel has a read-only filesystem.** This means:
- You can read the database if it's included in the deployment.
- **You cannot save new events or votes permanently.** Any data added will be lost when the serverless function restarts.

**Recommendation:**
For a production app on Vercel, you should replace SQLite with a cloud database like:
- **MongoDB Atlas**
- **Supabase (PostgreSQL)**
- **Neon (PostgreSQL)**

## Developed By
**Al Hasib**
Copyright © 2026 Kushtia Iftari Tracker.
