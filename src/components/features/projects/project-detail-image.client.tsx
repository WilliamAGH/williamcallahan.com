"use client";

import type { ReactNode } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

/** Parallax is an image-only enhancement; project text and links remain server-owned. */
export function ProjectDetailImage({ children }: { children: ReactNode }) {
  const { scrollY } = useScroll();
  const imageY = useTransform(scrollY, [0, 300], [0, -20]);

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mb-6 sm:mb-8"
    >
      <div className="relative group">
        <motion.div
          style={{ y: imageY }}
          className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm"
        >
          {children}
        </motion.div>
      </div>
    </motion.div>
  );
}
