# HiGO WhatsApp Bot Service

Standalone NestJS service for WhatsApp Business API integration.

## Architecture

- **Separate Railway service** — isolated from main API/Worker
- **Shared database** — uses same PostgreSQL as Hiconnect
- **Shared Redis** — for caching (optional)

## Environment Variables

```env
# Database (shared with main API)
DATABASE_URL=postgresql://...

# Redis (optional, for caching)
REDIS_URL=redis://...

# WhatsApp Business API
WHATSAPP_PHONE_NUMBER_ID=xxx
WHATSAPP_ACCESS_TOKEN=xxx
WHATSAPP_APP_SECRET=xxx
WHATSAPP_VERIFY_TOKEN=xxx

# AI (optional)
OPENROUTER_API_KEY=xxx

# Service
PORT=3001
```

## Deployment

### Railway

1. Create new service in Railway project
2. Link to `higo-platform` repo, branch `main`
3. Set Dockerfile path: `services/whatsapp-bot/Dockerfile`
4. Set environment variables
5. Deploy

### Local Development

```bash
cd services/whatsapp-bot
cp ../../.env .env  # Copy shared env
# Add WHATSAPP_* variables
pnpm install
pnpm dev
```

## Webhook URL

Configure in Meta Business Suite:
```
https://www.hiconnectgo.com/whatsapp/webhook
```

Or direct (if using separate domain):
```
https://whatsapp.hiconnectgo.com/api/whatsapp/webhook
```

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/whatsapp/webhook` | Meta verification |
| POST | `/api/whatsapp/webhook` | Receive messages |
| GET | `/health` | Health check |
| GET | `/api/whatsapp/conversations` | List conversations |
| GET | `/api/whatsapp/health` | Bot health status |
| GET | `/api/whatsapp/stats` | Statistics |
