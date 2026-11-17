# Frontend-Backend Integration Guide
**Version**: 1.0.0 | **Status**: Production Ready

## API Endpoints

### Base URL
```javascript
const API_BASE = window.location.hostname === "localhost" 
    ? "http://localhost:8000" 
    : "https://axelr-backend.onrender.com";
```

### Core Endpoints

| Method | Endpoint | Purpose | Auth Required |
|--------|----------|---------|---------------|
| `POST` | `/api/chat` | Send chat message | ✅ |
| `GET` | `/api/history` | Fetch chat history | ✅ |
| `DELETE` | `/api/history/:id` | Delete conversation | ✅ |
| `POST` | `/api/auth/google` | Google OAuth callback | ❌ |
| `GET` | `/api/user` | Get user profile | ✅ |
| `POST` | `/api/subscribe` | Create subscription | ✅ |
| `GET` | `/api/models` | List available models | ✅ |
| `POST` | `/api/asr` | Server-side speech recognition | ✅ |
| `GET` | `/api/health` | Backend health check | ❌ |

---

## Request/Response Examples

### Chat Completion
```javascript
// Request
const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
        message: "Extract data from this CSV",
        model: "flash",
        category: "data",
        session_id: "session_123"
    })
});

// Response (streaming)
const reader = response.body.getReader();
const decoder = new TextDecoder();
while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    // Append chunk to chat UI
}
```

### Speech Recognition
```javascript
// Send audio blob for server-side ASR
const formData = new FormData();
formData.append('audio', audioBlob);

const response = await fetch(`${API_BASE}/api/asr`, {
    method: 'POST',
    credentials: 'include',
    body: formData
});

const result = await response.json();
// result.transcript contains recognized text
```

---

## Authentication Flow

1. **Initiate OAuth**: Click "Sign in with Google"
2. **Popup**: Google OAuth window opens
3. **Callback**: Backend verifies token, sets HTTP-only cookie
4. **Verify**: Frontend calls `/api/user` to confirm auth status
5. **Session**: JWT cookie auto-included in all requests

---

## Error Handling

All API errors follow this format:
```json
{
    "error": "Error message",
    "code": "E400",
    "details": { "field": "message" },
    "retry_after": 5000
}
```

### Retry Logic
- 429 (Rate limit): Retry after `retry_after` ms
- 500 (Server error): Exponential backoff (max 3 retries)
- 401 (Unauthorized): Redirect to auth flow
- Network error: Fallback to offline mode

---

## WebSocket Connection

For real-time features:
```javascript
const ws = new WebSocket(`${API_BASE.replace('http', 'ws')}/ws`);
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    // Handle streaming response, status updates
};
```

---

## Deployment Checklist

✅ Frontend `API_BASE` points to production backend
✅ CORS configured on backend
✅ OAuth origins whitelisted
✅ WebSocket proxy configured
✅ Rate limits tuned for frontend traffic
✅ Health check endpoint monitored
✅ Error logging integrated

*Last updated: 2026-11-17*