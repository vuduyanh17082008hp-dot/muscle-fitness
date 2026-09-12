import { useRef } from "react";
import type { Group } from "three";

import { useDantePose } from "@/components/dante-avatar/use-dante-pose";
import type { DantePoseName } from "@/components/dante-avatar/poses";

/**
 * Dante — procedural placeholder figure (spec Part D §20-21).
 *
 * HONESTY NOTE, stated once, clearly: this is a primitive-geometry
 * humanoid (capsules/spheres/cylinders in a nested-group "rig"), NOT
 * a sculpted 3D character model. No 3D modeling tool was available to
 * author the actual "Golden Era bodybuilding + Roman/Renaissance +
 * dark steel/bronze" character art the spec describes — that requires
 * an artist or a generative-3D asset pipeline, neither of which this
 * session has. What IS real and production-ready here: the nested-
 * group hierarchy (a legitimate MVP "rig" — rotating a parent group
 * rotates its attached limb, exactly like a bone would), the pose
 * state machine (poses.ts + use-dante-pose.ts), and the swap point
 * for a real model (see dante-avatar-scene.tsx's comment on
 * useGLTF) — dropping a real .glb into public/models/dante.glb and
 * swapping this component for a useGLTF-based one requires no changes
 * to the pose system at all, since poses are just target rotations
 * per named joint.
 *
 * Materials approximate the spec's "dark steel + bronze + subtle red"
 * direction with plain MeshStandardMaterial — no textures, since none
 * exist for a placeholder figure.
 */

const STEEL = { color: "#1c1e22", metalness: 0.6, roughness: 0.35 } as const;
const BRONZE = { color: "#8a5a2b", metalness: 0.85, roughness: 0.3 } as const;
const ACCENT_RED = { color: "#5a1414", metalness: 0.4, roughness: 0.5, emissive: "#3a0a0a", emissiveIntensity: 0.3 } as const;

export function DanteFigure({ pose }: { pose: DantePoseName }) {
  const spine = useRef<Group>(null);
  const head = useRef<Group>(null);
  const shoulderL = useRef<Group>(null);
  const shoulderR = useRef<Group>(null);
  const elbowL = useRef<Group>(null);
  const elbowR = useRef<Group>(null);
  const hipL = useRef<Group>(null);
  const hipR = useRef<Group>(null);
  const kneeL = useRef<Group>(null);
  const kneeR = useRef<Group>(null);

  useDantePose(
    { spine, head, shoulderL, shoulderR, elbowL, elbowR, hipL, hipR, kneeL, kneeR },
    pose,
  );

  return (
    <group position={[0, -1, 0]}>
      {/* Legs hang from the pelvis (root), unaffected by spine rotation. */}
      <group ref={hipL} position={[-0.18, 1, 0]}>
        <mesh position={[0, -0.35, 0]} castShadow>
          <capsuleGeometry args={[0.13, 0.5, 4, 8]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
        <group ref={kneeL} position={[0, -0.7, 0]}>
          <mesh position={[0, -0.32, 0]} castShadow>
            <capsuleGeometry args={[0.11, 0.5, 4, 8]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
        </group>
      </group>

      <group ref={hipR} position={[0.18, 1, 0]}>
        <mesh position={[0, -0.35, 0]} castShadow>
          <capsuleGeometry args={[0.13, 0.5, 4, 8]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
        <group ref={kneeR} position={[0, -0.7, 0]}>
          <mesh position={[0, -0.32, 0]} castShadow>
            <capsuleGeometry args={[0.11, 0.5, 4, 8]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
        </group>
      </group>

      {/* Torso, arms and head all hang off the spine group. */}
      <group ref={spine} position={[0, 1, 0]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <capsuleGeometry args={[0.28, 0.55, 4, 8]} />
          <meshStandardMaterial {...BRONZE} />
        </mesh>

        {/* Belt-line accent — the "subtle red" (spec §20). */}
        <mesh position={[0, 0.05, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.06, 16]} />
          <meshStandardMaterial {...ACCENT_RED} />
        </mesh>

        <group ref={head} position={[0, 0.85, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.18, 16, 16]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
        </group>

        <group ref={shoulderL} position={[-0.32, 0.62, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow>
            <capsuleGeometry args={[0.1, 0.42, 4, 8]} />
            <meshStandardMaterial {...BRONZE} />
          </mesh>
          <group ref={elbowL} position={[0, -0.55, 0]}>
            <mesh position={[0, -0.24, 0]} castShadow>
              <capsuleGeometry args={[0.08, 0.38, 4, 8]} />
              <meshStandardMaterial {...STEEL} />
            </mesh>
          </group>
        </group>

        <group ref={shoulderR} position={[0.32, 0.62, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow>
            <capsuleGeometry args={[0.1, 0.42, 4, 8]} />
            <meshStandardMaterial {...BRONZE} />
          </mesh>
          <group ref={elbowR} position={[0, -0.55, 0]}>
            <mesh position={[0, -0.24, 0]} castShadow>
              <capsuleGeometry args={[0.08, 0.38, 4, 8]} />
              <meshStandardMaterial {...STEEL} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
