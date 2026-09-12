"use client";

import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";

import { DanteFigure } from "@/components/dante-avatar/dante-figure";
import type { DantePoseName } from "@/components/dante-avatar/poses";

/**
 * Three.js scene wrapper (spec Part D §21).
 *
 * To swap the procedural placeholder for a real character model once
 * one exists: replace <DanteFigure pose={pose} /> below with a
 * component that calls `useGLTF("/models/dante.glb")` and drives an
 * AnimationMixer from the model's own clips — poses.ts's target
 * rotations would no longer apply directly (a real rig uses named
 * bones, not these placeholder group names), but the pose STATE
 * MACHINE (which pose is active, how transitions are triggered) in
 * use-dante-pose.ts / poses.ts stays valid; only the "how a pose gets
 * applied to the mesh" layer changes.
 */

export function DanteAvatarScene({
  pose,
  className,
}: {
  pose: DantePoseName;
  className?: string;
}) {
  return (
    <Canvas
      className={className}
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.3, 3.2], fov: 35 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[2, 3, 2]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-2, 1, -1]} intensity={0.3} color="#b5793a" />
      <Environment preset="city" />
      <DanteFigure pose={pose} />
    </Canvas>
  );
}
