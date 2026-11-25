"use client";

import React, { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

interface BlurTextProps {
  text: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  threshold?: number;
}

export default function BlurText({
  text,
  delay = 50,
  className = "",
  animateBy = "words",
  direction = "top",
  threshold = 0.1,
}: BlurTextProps) {
  const elements = animateBy === "words" ? text.split(" ") : text.split("");
  const ref = useRef<HTMLParagraphElement>(null);
  const inView = useInView(ref, { once: true, amount: threshold });
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <span className={className}>{text}</span>;
  }

  const yOffset = direction === "top" ? -14 : 14;

  return (
    <span ref={ref} className={`inline-block ${className}`}>
      {elements.map((element, i) => (
        <motion.span
          key={i}
          initial={{ filter: "blur(10px)", opacity: 0, y: yOffset }}
          animate={
            inView
              ? { filter: "blur(0px)", opacity: 1, y: 0 }
              : { filter: "blur(10px)", opacity: 0, y: yOffset }
          }
          transition={{
            duration: 0.45,
            delay: (i * delay) / 1000,
            ease: [0.25, 0.4, 0.25, 1],
          }}
          className="inline-block"
        >
          {element}
          {animateBy === "words" && i < elements.length - 1 && "\u00A0"}
        </motion.span>
      ))}
    </span>
  );
}
