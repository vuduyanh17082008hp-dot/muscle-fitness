import StoryChapter from "@/components/story/StoryChapter"
import StoryLidentity from "@/components/story/StoryLidentity"
import StoryTimeline from "@/components/story/StoryTimeline"
import TransformationComparison from "@/components/story/TransformationComparison"
import TransformationStats from "@/components/story/TransformationStats"
import storyData from "@/data/storyContent"

export default function StoryPage() {
  return (
    <main className="min-h-screen bg-[#070707] text-white">
      <StoryLidentity />

      <TransformationStats />

      <TransformationComparison />

      <StoryTimeline />

      <div>
        {storyData.chapters.map(
          (chapter, index) => (
            <StoryChapter
              key={chapter.id}
              chapter={chapter}
              index={index}
            />
          ),
        )}
      </div>
    </main>
  )
}