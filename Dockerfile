# Stage 1: Install dependencies and build frontend
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files for both frontend and backend
COPY frontend/package.json frontend/bun.lock* frontend/
COPY backend/package.json backend/bun.lock* backend/

# Install dependencies
RUN cd frontend && bun install --frozen-lockfile || bun install
RUN cd backend && bun install --frozen-lockfile || bun install

# Copy source code
COPY frontend/ frontend/
COPY backend/ backend/

# Build the frontend
RUN cd frontend && bun run build

# Stage 2: Production runtime
FROM oven/bun:1-slim

WORKDIR /app

# Copy backend with dependencies
COPY --from=builder /app/backend/ backend/
# Copy built frontend
COPY --from=builder /app/frontend/dist/ frontend/dist/

WORKDIR /app/backend

# Expose the port (Render provides PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Start the server
CMD ["bun", "run", "src/index.ts"]
