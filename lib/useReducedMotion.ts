import { useReducedMotion as useFramerReducedMotion } from "framer-motion";

export const useReducedMotion = () => {
  const prefersReduced = useFramerReducedMotion();
  return prefersReduced ?? false;
};