import { BookOpen } from "lucide-react";

import {
  recoveryKnowledgeCategories,
  recoveryKnowledgeTopics,
} from "@/data/recoveryKnowledge";

export function RecoveryKnowledgeHub() {
  return (
    <article className="rounded-3xl border border-mf-glass-border bg-mf-glass-surface p-6 sm:p-8">
      <div className="flex items-center gap-2">
        <BookOpen className="size-4 text-mf-glass-dante" aria-hidden="true" />
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-mf-glass-text-muted">
          Recovery Knowledge Hub
        </p>
      </div>

      <h2 className="mt-2 text-xl font-black text-mf-glass-text">
        Practical, evidence-aware recovery topics
      </h2>

      <div className="mt-6 space-y-8">
        {recoveryKnowledgeCategories.map((category) => {
          const topics = recoveryKnowledgeTopics.filter(
            (topic) => topic.category === category,
          );

          if (topics.length === 0) return null;

          return (
            <div key={category}>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-mf-glass-brand/80">
                {category}
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {topics.map((topic) => (
                  <details
                    key={topic.id}
                    className="group rounded-2xl border border-mf-glass-border bg-mf-glass-bg-deep p-4 open:border-mf-glass-brand-border"
                  >
                    <summary className="cursor-pointer list-none text-sm font-bold text-mf-glass-text marker:content-none">
                      {topic.title}
                    </summary>

                    <p className="mt-2 text-xs leading-5 text-mf-glass-text-muted">
                      {topic.whyItMatters}
                    </p>

                    <p className="mt-2 text-xs leading-5 text-mf-glass-text-muted">
                      <span className="font-semibold text-mf-glass-text-secondary">
                        Training impact:{" "}
                      </span>
                      {topic.trainingImpact}
                    </p>

                    <ul className="mt-2 space-y-1">
                      {topic.practicalActions.map((action) => (
                        <li
                          key={action}
                          className="flex gap-2 text-xs leading-5 text-mf-glass-text-muted"
                        >
                          <span className="text-mf-glass-brand">•</span>
                          {action}
                        </li>
                      ))}
                    </ul>

                    <p className="mt-3 text-[11px] leading-4 text-mf-glass-text-muted">
                      Evidence: ask Dante below for current PubMed / Europe
                      PMC / MedlinePlus sources on this topic.
                    </p>

                    <a
                      href="#dante-recovery-coach"
                      className="mt-3 inline-flex text-xs font-bold text-mf-glass-dante hover:text-mf-glass-brand"
                    >
                      Ask Dante →
                    </a>
                  </details>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
