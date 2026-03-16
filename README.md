# FaceFree Expert Panel Backend

Core AI backend service. Handles AI eyebrow generation using Google Gemini (GenAI SDK), customer data management, image processing with Sharp, and Google Cloud Storage operations.

## Part of FaceFree Platform
See the [main README](../../README.md) for full project documentation.

## Tech Stack
- Node.js, Express.js
- Google Gemini AI (@google/generative-ai SDK)
- Google Cloud Storage (@google-cloud/storage)
- Google Cloud Firestore
- Sharp (image processing)

## Key API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/eyebrow/generate` | AI eyebrow generation |
| GET | `/api/eyebrow/list/:customerId` | List generated eyebrows for a customer |
| - | Customer CRUD APIs | Create, read, update, delete customer data |

## Setup

```bash
git clone https://github.com/claud0604/03-06-02-expert-backend.git
cd 02-backend
npm install
cp .env.example .env
# Configure environment variables
node server.js
```

## Environment Variables
| Variable | Description |
|----------|-------------|
| PORT | Server port (default: 3062) |
| GCS_BUCKET | Google Cloud Storage bucket name |
| GCS_KEY_PATH | Path to service account key JSON |
| GEMINI_API_KEY | Google Gemini AI API key |

## Production Deployment
Deployed on Google Compute Engine with PM2.
```bash
gcloud compute ssh apl-backend-server --zone=asia-northeast3-a
cd /home/kimvstiger/apps/expert-backend/ && git pull && npm install && pm2 restart expert-backend
```
