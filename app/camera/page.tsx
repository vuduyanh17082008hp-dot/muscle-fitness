import PoseCamera from '@/components/PoseCamera';

export default function CameraPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">AI Form Coach</h1>
      <p className="text-gray-500 dark:text-gray-400">Thực hiện squat – AI sẽ đếm rep và đánh giá tư thế.</p>
      <PoseCamera />
    </div>
  );
}