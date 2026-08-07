# Local AI inference for Muscle Fitness

## GPU + Docker (vLLM)

1. Install Docker Desktop with NVIDIA Container Toolkit.
2. Copy `.env.example` → `.env` and set `VLLM_MODEL` / `VLLM_API_KEY`.
3. From repo root: `npm run ai:up`
4. Point app `.env.local` at `http://localhost:8000/v1`.

## No Docker GPU (Ollama)

1. Install Ollama from https://ollama.com
2. `ollama pull qwen2.5:7b`
3. `ollama serve`
4. Point app at `http://localhost:11434/v1` with `AI_MODEL=qwen2.5:7b`

See [docs/AI_PROVIDER_SETUP.md](../../docs/AI_PROVIDER_SETUP.md).
