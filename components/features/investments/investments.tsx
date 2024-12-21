/**
 * Investments Section Component
 */

"use client";

import { WindowControls } from '@/components/ui/navigation/window-controls';
import { InvestmentCard } from './investment-card';
import { investments } from '@/data/investments';

export function Investments() {
  return (
    <div className="max-w-5xl mx-auto mt-8">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
          <div className="flex items-center">
            <WindowControls />
            <h1 className="text-xl font-mono ml-4">~/investments</h1>
          </div>
        </div>
        
        <div className="p-6">
          <div className="space-y-6">
            {investments.map((investment) => (
              <InvestmentCard 
                key={investment.id} 
                investment={investment}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}