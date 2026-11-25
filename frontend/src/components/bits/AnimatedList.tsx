"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";

interface AnimatedListProps {
  children?: React.ReactNode;
  className?: string;
  stagger?: number;
  duration?: number;
}

export default function AnimatedList({
  children,
  className = "",
  stagger = 0.05,
  duration = 0.25,
}: AnimatedListProps) {
  const shouldReduceMotion = useReducedMotion();
  const childArray = React.Children.toArray(children);

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={className}>
      {childArray.map((child, index) => (
        <motion.div
          key={React.isValidElement(child) && child.key ? child.key : index}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration,
            delay: Math.min(index * stagger, 0.4),
            ease: [0.25, 0.4, 0.25, 1],
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
