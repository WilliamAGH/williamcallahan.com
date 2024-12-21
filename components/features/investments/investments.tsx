"use client";

import { WindowControls } from '@/components/ui/navigation/window-controls';

export function Investments() {
  const investments = [
    {
      id: 'aventure',
      name: 'aVenture',
      description: 'A platform democratizing access to venture capital investments.',
      type: 'Venture Capital',
      status: 'Active',
      year: '2020',
      image: 'https://images.unsplash.com/photo-1559526324-593bc073d938?auto=format&fit=crop&q=80'
    },
    {
      id: 'fintech-fund',
      name: 'Fintech Innovation Fund',
      description: 'Early-stage investments in financial technology startups.',
      type: 'Fund',
      status: 'Active',
      year: '2021',
      image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80'
    }
  ];

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
          <div className="grid gap-6 md:grid-cols-2">
            {investments.map((investment) => (
              <div
                key={investment.id}
                className="group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200"
              >
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={investment.image}
                    alt={investment.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-semibold">{investment.name}</h2>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {investment.year}
                    </span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    {investment.description}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {investment.type}
                    </span>
                    <span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                      {investment.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}