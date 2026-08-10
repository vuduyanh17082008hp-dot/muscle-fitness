# AI Provider Setup — Muscle Fitness

Muscle Fitness AI Coach uses an **OpenAI-compatible** inference backend. OpenAI paid credits are **not required**.

## Architecture

```
Browser → /api/ai-coach/chat → provider abstraction → inference server
                                         ↓
                              function tools (trusted server)
                                         ↓
                                   Supabase (RLS)
```

Providers (choose one — no automatic paid fallback):

| `AI_PROVIDER` | When to use |
|---|---|
| `openrouter` (default) | Free OpenRouter models — recommended to avoid OpenAI billing 429s |
| `self_hosted` | Local vLLM / Ollama / any OpenAI-compatible HTTPS server |
| `openai` | Legacy optional OpenAI only |

## Quick start (OpenRouter)

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY
OPENROUTER_MODEL=openrouter/free
# optional:
# OPENROUTER_SUMMARY_MODEL=openrouter/free
```

Get a key: https://openrouter.ai/keys

**Important:** OpenRouter never reuses `OPENAI_API_KEY`. OpenAI is used only when `AI_PROVIDER=openai` is set explicitly. There is no silent fallback on failure.

## Local development

### Option A — Docker + NVIDIA (vLLM)

Requires Docker with GPU support.

```bash
cp infra/ai/.env.example infra/ai/.env
# edit VLLM_MODEL and VLLM_API_KEY

npm run ai:up
```

App `.env.local`:

```env
AI_PROVIDER=self_hosted
AI_BASE_URL=http://localhost:8000/v1
AI_API_KEY=same-as-VLLM_API_KEY
AI_MODEL=Qwen/Qwen2.5-7B-Instruct
```

Stop:

```bash
npm run ai:down
```

### Option B — Ollama (no Docker GPU)

Install Ollama from https://ollama.com (do not run unknown installers from this repo).

```bash
ollama pull qwen2.5:7b
ollama serve
```

App `.env.local`:

```env
AI_PROVIDER=self_hosted
AI_BASE_URL=http://localhost:11434/v1
AI_API_KEY=ollama
AI_MODEL=qwen2.5:7b
```

### Option C — No local inference

The Next.js app still builds. Chat returns a clear Vietnamese setup error until `AI_BASE_URL` / `AI_MODEL` point at a reachable server.

## Production (Vercel)

Recommended (OpenRouter):

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY
OPENROUTER_MODEL=openrouter/free
```

Self-hosted alternative — Vercel **must not** use `localhost` / `127.0.0.1` as `AI_BASE_URL`:

```env
AI_PROVIDER=self_hosted
AI_BASE_URL=https://YOUR-PUBLIC-AI-ENDPOINT/v1
AI_API_KEY=PRIVATE_SECRET
AI_MODEL=your-deployed-model-id
AI_SUMMARY_MODEL=your-deployed-model-id
```

Do **not** load an 8B model inside a normal Vercel function.

## Useful commands

```bash
npm run ai:check    # validate provider config + tool schemas
npm run ai:health   # hit /api/ai-coach/health (dev server must be running)
npm run dev
npm run type-check
npm run build
```

## Security

- Never set `NEXT_PUBLIC_*` for AI keys.
- User IDs always come from the Supabase session.
- Tools run only in trusted server code with confirmation for writes.
