# BlockSign — E-Signing & Document Execution Platform

BlockSign is a full-stack digital document signing and execution application built with **React, TypeScript, Vite, Elysia JS, Bun, SQLite, and pdf-lib**.

---

## Features

- **Upload & Request Signature**: Upload PDF contracts and dispatch email signing notifications.
- **Dedicated Signer Portal (`/sign/:id`)**: Focused, distraction-free recipient portal with customizable Type or Draw (Canvas) signatures.
- **Cryptographic PDF Stamping**: High-performance PDF modification with `pdf-lib`, embedding official verification badges, signer credentials, timestamps, and reference IDs directly onto the document.
- **Real-Time Execution Tracker**: Interactive dashboard tracking status (`Pending` vs `Signed & Returned`), with instant download links, sample seeding, and document removal.
- **High-Performance Native File Streaming**: Direct file delivery powered by Bun's native file streaming engine.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Lucide Icons, Canvas Confetti
- **Backend**: Elysia JS, Bun, Bun SQLite, pdf-lib, @elysiajs/cors

---

## Getting Started

### 1. Backend

```bash
cd backend
bun install
bun --watch run src/index.ts
```

Backend runs on `http://localhost:3000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

---

## Running Tests & Type Checks

### Backend Unit Tests & TypeScript Check
```bash
cd backend
bun test            # Runs all 12 unit tests
bun x tsc --noEmit  # Verifies 0 TypeScript compilation errors
```

### Frontend Build & Type Check
```bash
cd frontend
bun run build       # Verifies frontend builds with 0 errors
```

---

## Verifying Frontend-Backend Connection (No Errors)

### 1. API Health Check
Open `http://localhost:3000/health` in your browser or curl:
```bash
curl http://localhost:3000/health
# Response: {"status":"ok","runtime":"bun"}
```

### 2. Live In-Browser Verification
1. Open **`http://localhost:5173`** in your browser.
2. Press **F12** (or Right Click → Inspect) and open the **Console** & **Network** tabs.
3. Refresh the page:
   - You should see `GET http://localhost:3000/api/documents` return status **`200 OK`**.
   - The **DashBoard** table will display items without any red error banners or console exceptions.
4. Upload a test PDF and click **Dispatch for Signature**:
   - `POST http://localhost:3000/api/upload` returns status **`200 OK`**.
5. Click **Sign** on any contract, draw your signature, and submit:
   - `POST http://localhost:3000/api/sign/:id` returns status **`200 OK`** and triggers celebratory confetti!

