# Equip Nutrition Coaching

Full-stack nutrition coaching app for a CrossFit side business.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express (Vercel serverless API)
- Database: Firebase Firestore (Admin SDK)

## Features Implemented

- Create and store client profiles
- New client setup form with:
  - Name
  - Weight (lbs)
  - Height (feet + inches)
  - Age (optional)
  - Activity multiplier (14-18)
  - Goal (Cut, Bulk, Maintenance)
  - Optional custom plan and notes
- Calorie calculation:
  - Maintenance = `activityMultiplier * weight`
  - Cut = maintenance - 400
  - Bulk = maintenance + 350
  - Maintenance = no adjustment
- Client profile page shows:
  - Maintenance calories
  - Adjusted calorie target
  - Auto-generated macro targets (protein, fats, carbs)
  - BMI + protein reference method (current, adjusted, or goal bodyweight)
  - Goal and activity multiplier
  - Editable coach controls (weight, height, activity, goal, fat %, calorie override)
  - Optional macro gram overrides (protein/fats/carbs)
  - Editable nutrition plan and notes
  - Weekly check-in history (weight + notes)
  - Trend-based calorie adjustment recommendation (coach override supported)

## Project Structure

- `client/` React app
- `server/` Express API

## Setup

1. Create backend env file:
   - Copy `server/.env.example` to `server/.env`
   - Fill Firebase Admin service-account values
2. Install dependencies:
   - Root: `npm install`
   - Client: `npm install --prefix client`
   - Server: `npm install --prefix server`
3. Run both frontend and backend:
   - `npm run dev`
4. Open the frontend in browser:
   - `http://localhost:5173`

Backend runs at `http://localhost:5000` in local development.

## API Endpoints

- `GET /api/health`
- `GET /api/clients`
- `GET /api/clients/:id`
- `POST /api/clients`
- `PATCH /api/clients/:id`

## Optional Frontend API URL

To point frontend to a different API, add `client/.env`:

`VITE_API_BASE_URL=http://localhost:5000/api`

## Firebase Setup

- Frontend Firebase config lives in `client/.env.local`.
- Backend Firestore access uses Firebase Admin credentials in `server/.env`.
- Required backend vars:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY`
- For `FIREBASE_PRIVATE_KEY`, keep line breaks escaped as `\n`.

## Deploy To Vercel

1. Import this GitHub repo into Vercel.
2. Vercel will use `vercel.json` to build the Vite app and serve API routes from `api/index.js`.
3. In Vercel Project Settings -> Environment Variables, add:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
