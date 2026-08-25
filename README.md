# Family Hub PWA

A single installable PWA at `family.rickenback.net` hosting multiple family mini-apps under one login and shared Firestore data model.

## Setup

### Prerequisites
- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- A Google Cloud project

### Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up Firebase**
   - Create a Firebase project at https://console.firebase.google.com
   - Update `.firebaserc` with your project ID
   - Copy `.env.example` to `.env.local` and add your Firebase config

3. **Run dev server**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

4. **Deploy**
   ```bash
   npm run build
   firebase deploy
   ```

## Project Structure

```
src/
  ├── main.tsx              # Entry point, SW registration
  ├── sw.ts                 # Service worker (injectManifest strategy)
  ├── App.tsx               # Main app shell, auth, routing
  ├── App.css
  ├── index.css             # Global styles
  ├── lib/
  │   ├── firebase.ts       # Firebase/Auth setup
  │   └── router.ts         # App config, visibility, roles
  └── components/
      ├── AuthScreen.tsx
      ├── Nav.tsx           # App navigation
      ├── UpdatePrompt.tsx  # PWA update notification
      └── *.css

public/
  ├── icon-192.png          # PWA icons
  └── icon-512.png

firestore.rules            # Security rules
firebase.json              # Hosting config (sets SW cache headers)
.env.local                 # Firebase config (from .env.example)
```

## Key Features

### PWA + Update Mechanism
- Single shared service worker covering all app subpaths
- `Cache-Control: no-cache` on SW file ensures browsers always check for new versions
- Periodic update checks (every 60s while open, on visibility change)
- Update prompt with user tap-to-apply (posts `SKIP_WAITING` to SW, reloads on controller change)

### Auth
- Google Sign-In with redirect (compatible with installed PWA mode)
- Family allowlist in Firestore: `config/allowedEmails`
- Role-based access: `guest`, `kid`, `parent`

### Apps
All apps live at subpaths and use a shared `games/{gameId}` collection for real-time multiplayer.
- Blocks (puzzle)
- Tic Tac Toe, Connect 4, Dots and Boxes, Hangman, War, Battleship, Uno (2-player games)
- Countdowns
- Schedule (Google Calendar + ICS feeds)

### Security
- Firestore rules enforce family allowlist and role-based visibility
- Per-app visibility control: `all`, `familyOnly`, `parentOnly`
- Router checks role before displaying/rendering each app
- Battleship ship positions hidden via field-level rules

## Next Steps

1. Create Firebase project and configure `.env.local`
2. Set up allowlist in Firestore: `config/allowedEmails` doc
3. Deploy and test auth flow
4. Build Blocks app (highest priority)
5. Build 2-player game skeleton with Tic Tac Toe
6. Build Countdowns and Schedule apps
