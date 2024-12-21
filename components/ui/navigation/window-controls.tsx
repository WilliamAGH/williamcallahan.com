/**
 * Window Controls Component
 */

import { Circle } from 'lucide-react';

export function WindowControls() {
  return (
    <div className="flex items-center space-x-2 mr-4" aria-hidden="true">
      <div className="w-3 h-3 rounded-full bg-red-500" />
      <div className="w-3 h-3 rounded-full bg-yellow-500" />
      <div className="w-3 h-3 rounded-full bg-green-500" />
    </div>
  );
}