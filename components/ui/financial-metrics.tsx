import React from 'react';

interface MetricRowProps {
  label: string;
  value: string;
  isNegative?: boolean;
  isPositive?: boolean;
}

export const MetricRow: React.FC<MetricRowProps> = ({ label, value, isNegative, isPositive }) => {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700 last:border-0">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <span className={`text-sm font-medium tabular-nums tracking-tight ${
        isNegative
          ? 'text-red-600 dark:text-red-400'
          : isPositive
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-gray-900 dark:text-gray-100'
      }`}>
        {value}
      </span>
    </div>
  );
};

interface MetricsGroupProps {
  title: string;
  date: string;
  metrics: {
    label: string;
    value: string;
    isNegative?: boolean;
    isPositive?: boolean;
  }[];
  className?: string;
}

export const MetricsGroup: React.FC<MetricsGroupProps> = ({ title, date, metrics, className = '' }) => {
  return (
    <div className={`my-8 ${className}`}>
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm italic text-gray-600 dark:text-gray-400 mb-4">{date}</p>
      <div className="bg-white/50 dark:bg-gray-800/50 rounded-xl shadow-xl ring-1 ring-black/5 dark:ring-white/5 overflow-hidden">
        <div className="px-6 py-2 divide-y divide-gray-200 dark:divide-gray-700">
          {metrics.map((metric, index) => (
            <MetricRow key={index} {...metric} />
          ))}
        </div>
      </div>
    </div>
  );
};
