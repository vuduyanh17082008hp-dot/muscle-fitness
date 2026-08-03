"use client";
import { useState } from 'react';
import { motion } from 'framer-motion';
import ExerciseCard from '@/components/ExerciseCard';
import toast from 'react-hot-toast';

const exercises = [
  { name: 'Squat', muscle: 'Quads', difficulty: 'Beginner', anatomy: '/exercises/squat.png' },
  { name: 'Push Up', muscle: 'Chest', difficulty: 'Beginner', anatomy: '/exercises/pushup.png' },
  { name: 'Deadlift', muscle: 'Back', difficulty: 'Advanced', anatomy: '/exercises/deadlift.png' },
];

export default function WorkoutPage() {
  const [plan, setPlan] = useState<string | null>(null);

  const generatePlan = async () => {
    const res = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: 'strength' }) });
    const data = await res.json();
    setPlan(data.plan);
    toast.success('AI plan generated!');
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Smart Workouts</h1>
      <button onClick={generatePlan} className="px-6 py-3 bg-brand-500 text-white rounded-full font-semibold hover:bg-brand-600 transition">
        Generate AI Plan
      </button>
      {plan && <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-xl whitespace-pre-wrap">{plan}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {exercises.map(ex => (
          <ExerciseCard key={ex.name} {...ex} />
        ))}
      </div>
    </div>
  );
}