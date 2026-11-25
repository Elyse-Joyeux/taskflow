"use client";

import React, { useEffect, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

interface CountUpProps {
  to: number;
  from?: number;
  duration?: number;
  decimals?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

export default function CountUp({
  to,
  from = 0,
  duration = 1,
  decimals = 0,
  className = "",
  prefix = "",
  suffix = "",
}: CountUpProps) {
  const [current, setCurrent] = useState<number>(from);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (shouldReduceMotion) {
      setCurrent(to);
      return;
    }

    const controls = animate(from, to, {
      duration,
      ease: [0.25, 0.4, 0.25, 1],
      onUpdate: (latest) => {
        setCurrent(latest);
      },
    });

    return () => controls.stop();
  }, [to, from, duration, shouldReduceMotion]);

  const formatted = decimals > 0 ? current.toFixed(decimals) : Math.round(current).toString();

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
