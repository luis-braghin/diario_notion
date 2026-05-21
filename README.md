# Diário Positivo AI — Backend

API Node.js que transcreve áudios de diário pessoal, processa o texto com IA e salva no Notion. Suporta múltiplas páginas do Notion e três estilos de formatação.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Speech-to-Text | OpenAI Whisper API |
| Text Processing | Anthropic Claude API (`@anthropic-ai/sdk`) |
| Storage | Notion API (`@notionhq/client`) |
| Security | Helmet, CORS, express-rate-limit |
| File Upload | Multer (max 25MB) |
| Other | compression, dotenv |

## Installation

```bash
npm install
cp .env.example .env
# Fill in your keys
```

### Environment Variables

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
NOTION_TOKEN=secret_...
NOTION_PAGE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  # required
NOTION_PAGE_ID_2=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx # optional
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*
```

> **Notion page ID**: extract from the page URL — `notion.so/My-Page-<pageId>` — and create an integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) with access to the target pages.

## Running

```bash
npm run dev    # Development (hot reload)
npm start      # Production
npm test       # Integration tests
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Quick health check |
| GET | `/health/detailed` | Status of all APIs and configured pages |
| GET | `/api/pages` | List configured Notion pages |
| GET | `/api/styles` | List available processing styles |
| POST | `/api/process-audio` | Transcribe audio + process with Claude (preview only) |
| POST | `/api/entries` | Save confirmed entry to Notion |

### Typical Flow

1. `POST /api/process-audio` — send audio + style → receive transcription and processed text preview
2. User reviews preview and selects target page
3. `POST /api/entries` — send text + target → saved to Notion

**POST /api/process-audio** (`multipart/form-data`):
- `audio` — file (mp3, wav, m4a, webm, ogg, mp4, flac, mpeg, mpga; max 25MB)
- `style` — `fiel` | `objetivo` | `categorizado`

**POST /api/entries** (JSON):
```json
{ "text": "Diary text", "date": "2026-03-12", "target": "principal" }
```

## Main Features

- **Three processing styles**
  - `fiel` — Literal transcription with grammar correction, preserves personal tone
  - `objetivo` — Direct summary in 2–3 paragraphs, removes redundancy
  - `categorizado` — Organized by topic with bullet points and emojis
- **Multiple Notion pages** — Route entries to `principal` or `secundaria`
- **Chronological append** — Each entry added at end of page as `## DD Month YYYY`
- **Long-text splitting** — Chunks text to respect Notion's 2000-char block limit
- **Rate limiting** — 100 req/15min global; 5 req/min for audio processing
- **Graceful shutdown** — Clean termination on SIGTERM/SIGINT

## Folder Structure

```
src/
  routes/
    audio.js        # POST /api/process-audio, POST /api/entries, GET /api/styles
  services/
    whisper.js      # OpenAI Whisper — audio transcription
    claude.js       # Anthropic Claude — text processing
    notion.js       # Notion API — multi-page storage
  utils/
    prompts.js      # Prompts per style
  server.js         # Express setup, middlewares, health checks
uploads/            # Temporary audio files (auto-deleted after processing)
test-backend.js     # Integration tests
```
