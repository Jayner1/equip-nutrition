# CrossFit Nutrition Coach

Full-stack nutrition coaching app for a CrossFit side business.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Storage: Local JSON store (`server/src/data/clients.json`)

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
2. Install dependencies:
   - Root: `npm install`
   - Client: `npm install --prefix client`
   - Server: `npm install --prefix server`
3. Run both frontend and backend:
   - `npm run dev`
4. Open the frontend in browser:
   - `http://localhost:5173`

Backend runs at `http://localhost:5000` by default.

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

- Firebase project settings should be placed in `client/.env.local`, not in `firebase.json`.
- Copy `client/.env.example` to `client/.env.local` and fill your values.
- `firebase.json` is reserved for Firebase Hosting/CLI config.
- Backend can sync clients to Firestore when `server/.env` includes:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_API_KEY`
  - `FIREBASE_APP_ID`
