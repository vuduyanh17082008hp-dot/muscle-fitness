export { retrieveDanteKnowledge } from "@/lib/dante-core/knowledge-brain/retrieve";
export { classifyKnowledgeBrainRoute } from "@/lib/dante-core/knowledge-brain/route";
export {
  embedText,
  embedBatch,
  isEmbeddingProviderConfigured,
} from "@/lib/dante-core/knowledge-brain/embedding-provider";
export { chunkDocument, normalizeMarkdown, hashChunkContent } from "@/lib/dante-core/knowledge-brain/chunk";

export type {
  KnowledgeCategory,
  KnowledgeVisibility,
  KnowledgeChunkRow,
  RetrievedKnowledgeChunk,
  RetrieveDanteKnowledgeParams,
  KnowledgeBrainSupabaseClient,
} from "@/lib/dante-core/knowledge-brain/types";
export type { ChatIntent, KnowledgeBrainRoute } from "@/lib/dante-core/knowledge-brain/route";
