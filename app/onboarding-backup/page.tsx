// app/onboarding/page.tsx

'use client';

import { useAuth } from '@/hooks/useAuth';
import { profileRepository } from '@/lib/repositories/profile-repository';
import { FitnessProfile } from '@/lib/client/client-profile';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function OnboardingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: '',
    age: '',
    sex: 'male',
    height: '',
    weight: '',
    targetWeight: '',
    goal: 'maintenance',
    activityLevel: 'moderate',
    experience: 'beginner',
    trainingDays: '3',
    sessionDuration: '45',
    equipment: 'barbell,dumbbells',
    priorityMuscles: 'chest,back,legs',
    mealsPerDay: '3',
    dietaryPreferences: '',
    dislikedFoods: '',
    allergies: '',
    steps: '',
    trainingTime: '08:00',
  });

  useEffect(() => {
    if (user) {
      profileRepository.get(user.id).then((profile: FitnessProfile | null) => {
        if (profile?.onboardingCompleted) {
          router.push('/dashboard');
        }
      });
    }
  }, [user, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const profile: FitnessProfile = {
        id: user.id,
        name: form.name || 'Athlete',
        age: parseInt(form.age) || 25,
        sex: form.sex as 'male' | 'female',
        heightCm: parseInt(form.height) || 175,
        weightKg: parseInt(form.weight) || 70,
        targetWeightKg: form.targetWeight ? parseInt(form.targetWeight) : undefined,
        goal: form.goal as FitnessProfile['goal'],
        activityLevel: form.activityLevel as FitnessProfile['activityLevel'],
        experience: form.experience as FitnessProfile['experience'],
        trainingDaysPerWeek: parseInt(form.trainingDays) || 3,
        sessionDurationMinutes: parseInt(form.sessionDuration) || 45,
        availableEquipment: form.equipment.split(',').map(s => s.trim()).filter(Boolean),
        priorityMuscles: form.priorityMuscles.split(',').map(s => s.trim()).filter(Boolean),
        mealsPerDay: parseInt(form.mealsPerDay) || 3,
        dietaryPreferences: form.dietaryPreferences.split(',').map(s => s.trim()).filter(Boolean),
        dislikedFoods: form.dislikedFoods.split(',').map(s => s.trim()).filter(Boolean),
        allergies: form.allergies.split(',').map(s => s.trim()).filter(Boolean),
        dailyStepTarget: form.steps ? parseInt(form.steps) : undefined,
        preferredTrainingTime: form.trainingTime,
        onboardingCompleted: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await profileRepository.save(user.id, profile);
      router.push('/dashboard');
    } catch (error) {
      console.error('Onboarding error:', error);
      alert('Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 p-8 rounded-lg w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-white mb-2">MUSCLE FITNESS</h1>
        <p className="text-zinc-400 mb-6">Build your foundation. Set up your profile.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-zinc-400 text-sm">Name</label><input name="name" value={form.name} onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-700 p-2 rounded text-white" /></div>
            <div><label className="text-zinc-400 text-sm">Age</label><input name="age" type="number" value={form.age} onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-700 p-2 rounded text-white" /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="text-zinc-400 text-sm">Sex</label><select name="sex" value={form.sex} onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-700 p-2 rounded text-white"><option value="male">Male</option><option value="female">Female</option></select></div>
            <div><label className="text-zinc-400 text-sm">Height (cm)</label><input name="height" type="number" value={form.height} onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-700 p-2 rounded text-white" /></div>
            <div><label className="text-zinc-400 text-sm">Weight (kg)</label><input name="weight" type="number" value={form.weight} onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-700 p-2 rounded text-white" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-zinc-400 text-sm">Goal</label><select name="goal" value={form.goal} onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-700 p-2 rounded text-white"><option value="fat-loss">Fat Loss</option><option value="recomposition">Recomposition</option><option value="maintenance">Maintenance</option><option value="lean-bulk">Lean Bulk</option><option value="muscle-gain">Muscle Gain</option></select></div>
            <div><label className="text-zinc-400 text-sm">Activity Level</label><select name="activityLevel" value={form.activityLevel} onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-700 p-2 rounded text-white"><option value="sedentary">Sedentary</option><option value="light">Light</option><option value="moderate">Moderate</option><option value="very-active">Very Active</option><option value="athlete">Athlete</option></select></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="text-zinc-400 text-sm">Experience</label><select name="experience" value={form.experience} onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-700 p-2 rounded text-white"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div>
            <div><label className="text-zinc-400 text-sm">Days/Week</label><input name="trainingDays" type="number" value={form.trainingDays} onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-700 p-2 rounded text-white" /></div>
            <div><label className="text-zinc-400 text-sm">Session (min)</label><input name="sessionDuration" type="number" value={form.sessionDuration} onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-700 p-2 rounded text-white" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-zinc-400 text-sm">Equipment (comma)</label><input name="equipment" value={form.equipment} onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-700 p-2 rounded text-white" /></div>
            <div><label className="text-zinc-400 text-sm">Priority Muscles (comma)</label><input name="priorityMuscles" value={form.priorityMuscles} onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-700 p-2 rounded text-white" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-zinc-400 text-sm">Meals/Day</label><input name="mealsPerDay" type="number" value={form.mealsPerDay} onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-700 p-2 rounded text-white" /></div>
            <div><label className="text-zinc-400 text-sm">Training Time</label><input name="trainingTime" type="time" value={form.trainingTime} onChange={handleChange} className="w-full bg-zinc-800 border border-zinc-700 p-2 rounded text-white" /></div>
          </div>
          <button type="submit" disabled={loading} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded transition">
            {loading ? 'SAVING...' : 'START YOUR JOURNEY'}
          </button>
        </form>
      </div>
    </div>
  );
}