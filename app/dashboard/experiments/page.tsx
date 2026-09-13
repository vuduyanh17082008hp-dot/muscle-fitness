import { requireUser } from "@/lib/auth/guard";
import { ExperimentLab } from "@/components/experiments/experiment-lab";
import { PageHeader } from "@/components/ui/page-header";
import { Reveal } from "@/components/animation/reveal";

export const dynamic = "force-dynamic";

export default async function ExperimentsPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-1 py-2">
      <Reveal>
        <PageHeader
          eyebrow="Personal Experiment Lab"
          title="Test your own hypotheses."
          description="Lightweight N-of-1 comparisons built entirely from what you already log — no new daily diary to keep. Every result names its sample size, its uncertainty, and states plainly that association is not causation."
        />
      </Reveal>

      <Reveal delay={0.08}>
        <ExperimentLab />
      </Reveal>
    </div>
  );
}
