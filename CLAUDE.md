# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EPUB Translator - A full-stack application for translating English EPUB books to Chinese using Moonshot LLM API. The project uses a monorepo structure with React frontend and Node.js backend.

## Development Commands

### Quick Start
```bash
# Install all dependencies (root, frontend, backend)
npm install

# Start both frontend and backend in development mode
npm run dev

# Frontend runs on http://localhost:5173
# Backend runs on http://localhost:3000
```

### Individual Services
```bash
# Backend only
npm run dev:backend

# Frontend only  
npm run dev:frontend

# Build for production
npm run build

# Start production server
npm run start
```

### Code Quality
```bash
# Run linting
npm run lint --workspace=backend
npm run lint --workspace=frontend

# Type checking
npm run typecheck --workspace=backend
npm run typecheck --workspace=frontend
```

## Architecture Overview

### Three-Layer Architecture
1. **Frontend (React)**: User interface for API configuration, file upload, and progress tracking
2. **Backend (Express)**: REST API + WebSocket server for file processing and translation orchestration
3. **Shared Types**: TypeScript interfaces shared between frontend and backend

### Key Design Patterns

#### Translation Pipeline
1. **File Upload** → Store temporarily with unique ID
2. **EPUB Parsing** → Extract chapters while preserving structure/images
3. **Style Detection** → Analyze content type (fiction/science/general)
4. **Chunking** → Smart splitting respecting sentence boundaries
5. **Translation** → Concurrent processing with Moonshot API
6. **Rebuilding** → Reconstruct EPUB with translated content
7. **Download** → Serve translated file

#### Real-time Communication
- WebSocket (Socket.io) for live progress updates
- Event-driven architecture with typed events
- Automatic reconnection and error recovery

#### Error Handling Strategy
- Exponential backoff for API retries (3 attempts max)
- Chapter-level failure isolation
- Graceful degradation with partial results

### Critical Implementation Details

#### EPUB Processing (`backend/src/services/epubService.ts`)
- Uses JSZip for EPUB manipulation
- Preserves all metadata and structure
- Image position retention through careful DOM parsing

#### Translation Service (`backend/src/services/translationService.ts`)
- Queue-based concurrent processing (default: 3 workers)
- Context window management for consistency
- Smart prompt templates based on content style

#### API Integration (`backend/src/services/translationService.ts`)
- Rate limiting: 10 requests/minute
- Token limit awareness (4000 tokens/request)
- Automatic chunk size optimization

### Environment Configuration

Backend requires `.env` file with:
```
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800
MOONSHOT_API_URL=https://api.moonshot.cn/v1
API_TIMEOUT=30000
WORKER_CONCURRENCY=3
```

## Key Files and Their Purposes

- `backend/src/index.ts` - Express server setup, middleware, route mounting
- `backend/src/services/epubService.ts` - EPUB parsing and reconstruction logic
- `backend/src/services/translationService.ts` - Translation orchestration, API calls, chunking
- `backend/src/api/translations.ts` - REST endpoints for translation tasks
- `frontend/src/App.tsx` - Main UI component orchestrating the translation flow
- `frontend/src/services/translationService.ts` - Frontend API client
- `shared/types/index.ts` - TypeScript interfaces used across the stack