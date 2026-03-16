# APL COLOR Image Agent — Expert Backend

AI-powered data analysis agent and image generation backend for professional beauty consultants. Built with **Google Gemini** and **Google Cloud** for the Gemini Live Agent Challenge.

## AI Agent (Gemini Function Calling)

The Expert Console includes an **agentic AI assistant** that autonomously searches and analyzes 12,000+ real customer diagnosis records using Gemini Function Calling.

### 4 Agent Tools

| Tool | Description | Example Query |
|------|-------------|---------------|
| `searchCustomers` | Search customers by color type, face shape, body type, name, gender, age, occupation | "Find Summer Light females in their 30s" |
| `getCustomerStats` | Aggregate statistics — type distribution, gender ratio, age averages | "What's the most common personal color type?" |
| `findSimilarCustomers` | Find customers with similar diagnosis profiles (color + face + body match with similarity scoring) | "Who has a similar profile to this customer?" |
| `getColorTrends` | Monthly diagnosis trend analysis over configurable time periods | "Has Winter type increased in the last 6 months?" |

### Agentic Behavior

The agent can **chain multiple tools autonomously** (up to 5 consecutive calls):

1. Expert asks: "Analyze this customer"
2. Agent reads customer context (color diagnosis, face analysis, body analysis, styling)
3. Agent **autonomously calls** `findSimilarCustomers` → compares against similar profiles
4. Agent **autonomously calls** `getCustomerStats` → positions customer against the population
5. Agent synthesizes all data into comprehensive insight

### Security

- Server acts as intermediary — Gemini never accesses DB directly
- Sensitive fields (phone, email, photo URLs) excluded from all query results
- Expert authentication required (`authExpert` middleware)

## AI Image Generation

| Feature | Model | Description |
|---------|-------|-------------|
| Lip Color | Gemini 3.1 Flash | Apply recommended lip colors to customer's face |
| Eye Shadow | Gemini 3.1 Flash | Apply recommended shadow colors |
| Eyebrow Styling | Gemini 3.1 Flash | Generate eyebrow shapes suited to face shape |
| Glasses | Gemini 3.1 Flash | Generate face-appropriate glasses |

All generated images preserve the customer's original face as much as possible.

## Tech Stack

- **Runtime**: Node.js 18+, Express.js
- **AI**: Google Gemini 2.5 Flash (Agent), Gemini 3.1 Flash (Image Generation)
- **SDK**: `@google/generative-ai` (Google GenAI SDK)
- **Database**: MongoDB Atlas (12,000+ records)
- **Storage**: Google Cloud Storage
- **Hosting**: Google Compute Engine (PM2)
- **Image Processing**: Sharp

## Quick Start

```bash
# Clone
git clone https://github.com/claud0604/03-06-02-expert-backend.git
cd 03-06-02-expert-backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start server
node server.js
# Server runs on http://localhost:3062
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3062) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `GCS_BUCKET` | Google Cloud Storage bucket name |
| `GCS_KEY_FILE` | Path to GCS service account key JSON |
| `GEMINI_API_KEY` | Google Gemini API key |
| `EXPERT_API_KEY` | Expert panel authentication key |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | AI Agent chat (Function Calling) |
| POST | `/api/eyebrow/generate` | AI eyebrow generation |
| GET | `/api/eyebrow/list/:id` | List generated eyebrows |
| GET | `/api/customers` | List customers |
| GET | `/api/customers/:id` | Get customer detail |
| POST | `/api/upload/photos` | Upload customer photos |
| POST | `/api/auth/login` | Expert authentication |

## Production Deployment

Deployed on Google Compute Engine with PM2:

```bash
gcloud compute ssh apl-backend-server --zone=asia-northeast3-a
cd /home/kimvstiger/apps/expert-backend
git pull && npm install && pm2 restart expert-backend
```

## Related Repositories

| Service | Repository |
|---------|------------|
| Expert Frontend | [03-06-02-expert-front](https://github.com/claud0604/03-06-02-expert-front.git) |
| Landing Frontend | [03-06-00-landing-page-front](https://github.com/claud0604/03-06-00-landing-page-front.git) |
| Landing Backend | [03-06-00-landing-page-back](https://github.com/claud0604/03-06-00-landing-page-back.git) |

## License

Built for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) hackathon.
