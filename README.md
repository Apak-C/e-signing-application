# InkFlow — Modern E-Signing & Document Execution Platform

A full-stack, enterprise-grade digital document signing and execution application built with React 19, TypeScript, Vite, Elysia JS, Bun, SQLite, PDF.js, and pdf-lib.

---

## Getting Started

Follow these instructions to set up and run the project locally on your machine.

### Prerequisites

Ensure you have the following installed on your system:
- [Bun](https://bun.sh/) (latest version recommended)
- [Node.js](https://nodejs.org/) (v18 or higher)

### 1. Clone the Repository

```bash
git clone https://github.com/Apak-C/e-signing-application.git
cd e-signing-application
```

### 2. Backend Setup

Navigate to the backend directory, install dependencies, and start the development server:

```bash
cd backend
bun install
bun run src/index.ts
```

> The backend server will start at `http://localhost:3000`.
> SQLite database `inkflow.db` and the `./storage` directory will be initialized automatically.

### 3. Frontend Setup

Open a new terminal window, navigate to the frontend directory, install dependencies, and start the Vite dev server:

```bash
cd frontend
npm install
npm run dev
```

> The frontend development server will start at `http://localhost:5173`.

### 4. Running Tests

To execute the automated backend unit test suite locally via Bun:

```bash
cd backend
bun test
```

To run TypeScript verification across frontend and backend:

```bash
# Backend type check
cd backend
bun x tsc --noEmit

# Frontend type check & production build
cd frontend
npm run build
```

---

## Overview & Features

InkFlow provides an intuitive, distraction-free workflow for uploading documents, positioning signatures interactively across multi-page PDFs, capturing handwritten signatures, and stamping signed PDFs with high performance.

- **Multi-File Batch Upload**: Upload single or multiple PDF contracts simultaneously and dispatch signing requests.
- **Interactive Drag-and-Drop Signature Placement**:
  - Recipients can drag and position their signature box anywhere on the actual PDF canvas.
  - Multi-page navigation with live page switching.
  - Real-time PDF point coordinate calculation (X, Y in standard PDF points).
- **Spacious Drawing Pad**:
  - Popout drawing modal with touch and mouse support.
  - Signature baseline guideline for clean, professional signatures.
  - Smooth stroke rendering with clear and redraw actions.
- **High-Performance PDF Stamping**:
  - Uses pdf-lib to burn the signature and centered signer name directly into the original PDF at exact recipient-chosen coordinates and pages.
  - Generates downloadable, cryptographically sealed signed PDFs.
- **Real-Time Execution Dashboard**:
  - Live status tracking (Pending vs Completed).
  - Instant one-click PDF downloads for completed contracts.
  - Sample database seeding with pre-configured contracts.
- **Native Bun Performance & Zero-Dependency UI**:
  - Elysia JS backend powered by Bun SQLite and native file streaming.
  - Pure custom SVG icon set with zero bloated third-party icon dependencies.
  - Automated 12-suite unit and integration test coverage.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, PDF.js (`pdfjs-dist`), Pure SVG Icons |
| **Backend** | Elysia JS, Bun runtime, Bun SQLite (`bun:sqlite`), `pdf-lib`, `@elysiajs/cors` |
| **Testing** | Bun Test runner (`bun test`), TypeScript compiler (`tsc --noEmit`) |
| **Deployment** | Multi-stage Docker, Render (`render.yaml`), Railway |

---

## API Endpoints Summary

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health check and runtime status |
| `POST` | `/api/upload` | Upload single or batch PDF contracts |
| `GET` | `/api/documents` | Retrieve list of all documents with execution status |
| `GET` | `/api/document/:id` | Fetch specific document metadata |
| `GET` | `/api/document/:id/file` | Stream original or signed PDF for browser viewing |
| `POST` | `/api/sign/:id` | Stamp drawn signature onto PDF at given (X, Y, page) |
| `GET` | `/api/download/:id` | Download finalized signed PDF attachment |
| `DELETE` | `/api/document/:id` | Delete document and stored PDF files |
| `POST` | `/api/seed` | Seed database with sample documents |

---

## Docker & Production Deployment

A unified, multi-stage `Dockerfile` is included that builds the frontend and runs the Elysia backend serving both API and static assets from a single container.

### Run with Docker locally:

```bash
docker build -t inkflow .
docker run -p 3000:3000 inkflow
```

Visit `http://localhost:3000` to access the full application.

### Deploy to Render / Railway:

1. Push this repository to GitHub.
2. In Render or Railway, create a new Web Service pointing to your repository.
3. It will automatically detect the `Dockerfile` and deploy with zero manual setup.
