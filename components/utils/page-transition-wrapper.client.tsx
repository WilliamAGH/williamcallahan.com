"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

interface PageTransitionWrapperProps {
  children: ReactNode;
}

export function PageTransitionWrapper({ children }: PageTransitionWrapperProps) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      {/* 'wait' mode ensures the exiting animation completes before the new one starts */}
      <motion.div
        key={pathname} // AnimatePresence needs a unique key for each child
        initial="initialState"
        animate="animateState"
        exit="exitState"
        transition={{
          duration: 0.3, // Adjust duration as needed
          ease: 'easeInOut',
        }}
        variants={{
          initialState: {
            opacity: 0,
            // Optional: Add slight Y translation for subtle movement
            // y: 10,
          },
          animateState: {
            opacity: 1,
            // y: 0,
          },
          exitState: {
            opacity: 0,
            // y: -10,
          },
        }}
        // Apply styling to the motion div if needed, e.g., to ensure it takes full width/height
        // className="w-full h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}