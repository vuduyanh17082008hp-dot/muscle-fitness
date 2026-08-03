import { motion } from 'framer-motion';
import Image from 'next/image';

export default function ExerciseCard({ name, muscle, difficulty, anatomy }: { name: string; muscle: string; difficulty: string; anatomy: string }) {
  return (
    <motion.div whileHover={{ y: -5 }} className="rounded-2xl overflow-hidden bg-white dark:bg-gray-800 shadow-lg">
      <Image src={anatomy} alt={name} width={400} height={300} className="w-full h-48 object-cover" />
      <div className="p-4">
        <h3 className="font-bold text-lg">{name}</h3>
        <p className="text-sm text-gray-500">{muscle} · {difficulty}</p>
      </div>
    </motion.div>
  );
}