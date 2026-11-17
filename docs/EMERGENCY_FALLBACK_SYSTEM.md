# AXELR AI Emergency Fallback System

## Overview
The Emergency Fallback System is a last-resort solution that activates automatically when the cloud backend becomes unreachable. It runs a complete local version of the backend directly in the user's browser, ensuring seamless functionality even when cloud servers are down.

## Key Features

### 1. Automatic Outage Detection
- Monitors cloud backend health through the existing `apiFetch` retry mechanism
- After 3 failed retries (network errors or 5xx status codes), the system activates automatically
- No user intervention required - the fallback starts instantly

### 2. Local Backend Implementation
- Runs in a Web Worker to avoid blocking the main UI thread
- Overrides global `fetch` to route all API requests to the local backend
- Maintains full compatibility with existing frontend code

### 3. Supported Features in Emergency Mode
- **Chat functionality**: Continues to work with local model inference
- **History management**: Saves and loads chat history from localStorage (50-chat limit)
- **Search functionality**: Searches through local chat history
- **User authentication**: Maintains the user's session locally
- **Embeddings generation**: Mock implementation ready for TensorFlow.js integration

### 4. Health Monitoring & Auto-Recovery
- Checks cloud backend health every 30 seconds while in fallback mode
- Notifies the user when the cloud backend is restored
- Persists fallback state across page reloads using localStorage

### 5. Developer Control
- Manual activation: `window.Axelr.activateEmergencyFallback()`
- Check status: `window.Axelr.isLocalBackendActive()`
- Manual deactivation: `window.Axelr.deactivateLocalBackend()`

## Files Modified

### Frontend
`Axelr-Frontend/js/20-auth.js`
- Added emergency system state management
- Enhanced `apiFetch` error handling to detect outages
- Implemented local backend Web Worker
- Added fetch override for API routing
- Implemented periodic health monitoring

### Backend
`Axelr-backend/app.py`
- Added `/health` endpoint for backend availability checks
- Returns simple health status with timestamp

## Data Persistence
- Local chat history stored in `axelr_local_history` (localStorage)
- Fallback state stored in `axelr_local_backend_active` (localStorage)
- Maximum 50 local chats to prevent localStorage bloat

## Production Roadmap
1. Integrate TensorFlow.js for actual local model inference
2. Add WebAssembly acceleration for heavy computations
3. Implement real embedding generation
4. Add encryption for local data at rest
5. Add sync mechanism to merge local history back to cloud when restored

## Usage Flow
1. Cloud backend goes down
2. Frontend detects failures after 3 retries
3. Emergency system activates automatically
4. User receives warning toast notification
5. All operations continue seamlessly in local mode
6. System monitors cloud health every 30 seconds
7. User receives success notification when cloud is restored
8. User refreshes to return to normal operation