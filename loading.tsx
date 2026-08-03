import { LoadingScreen } from "@/components/ui/loading-screen";

export default function Loading() {
  return (
    <LoadingScreen
      title="Building your journey"
      description="Preparing your training, nutrition and transformation experience."
      showSkeleton
    />
  );
}