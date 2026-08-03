// lib/repositories/profile-repository.ts

import { FitnessProfile } from '@/lib/client/client-profile';

export interface IProfileRepository {
  get(userId: string): Promise<FitnessProfile | null>;
  save(userId: string, profile: FitnessProfile): Promise<void>;
}

class LocalProfileRepository implements IProfileRepository {
  private getKey(userId: string): string {
    return `muscle_fitness_profile_${userId}`;
  }

  async get(userId: string): Promise<FitnessProfile | null> {
    if (typeof window === 'undefined' || !userId) return null;
    try {
      const raw = localStorage.getItem(this.getKey(userId));
      if (!raw) return null;
      return JSON.parse(raw) as FitnessProfile;
    } catch {
      return null;
    }
  }

  async save(userId: string, profile: FitnessProfile): Promise<void> {
    if (typeof window === 'undefined' || !userId) return;
    localStorage.setItem(this.getKey(userId), JSON.stringify(profile));
  }
}

export const profileRepository: IProfileRepository = new LocalProfileRepository();