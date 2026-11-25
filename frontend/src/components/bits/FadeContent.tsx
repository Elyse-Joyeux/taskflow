"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";

interface FadeContentProps {
  children: React.ReactNode;
  blur?: boolean;
  duration?: number;
  delay?: number;
  initialOpacity?: number;
  className?: string;
}

export default function FadeContent({
  children,
  blur = false,
  duration = 0.35,
  delay = 0,
  initialOpacity = 0,
  className = "",
}: FadeContentProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{
        opacity: initialOpacity,
        filter: blur ? "blur(8px)" : "none",
        y: 12,
      }}
      animate={{
        opacity: 1,
        filter: "none",
        y: 0,
      }}
      transition={{
        duration,
        delay,
        ease: [0.25, 0.4, 0.25, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
