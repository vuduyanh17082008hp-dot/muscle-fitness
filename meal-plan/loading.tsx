import { PageContainer } from "@/components/layout/page-container";
import {
  CardSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

export default function MealPlanLoading() {
  return (
    <section
      aria-busy="true"
      className="
        min-h-[calc(100svh-var(--navbar-height))]
        py-12
      "
    >
      <PageContainer>
        <div className="max-w-2xl">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-5 h-12 w-4/5" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
        </div>

        <div
          className="
            mt-12 grid gap-6
            md:grid-cols-2
            xl:grid-cols-3
          "
        >
          {[1, 2, 3, 4, 5, 6].map(
            (item) => (
              <CardSkeleton key={item} />
            ),
          )}
        </div>
      </PageContainer>
    </section>
  );
}