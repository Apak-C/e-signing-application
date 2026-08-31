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

## Running Tests

```bash
cd backend
bun test
```
