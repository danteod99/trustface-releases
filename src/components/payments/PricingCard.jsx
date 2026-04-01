import React from 'react';

export default function PricingCard({ name, price, period, features = [], highlighted = false, onSelect }) {
  return (
    <div
      className={`relative rounded-2xl p-6 border transition-all ${
        highlighted
          ? 'border-trust-accent bg-trust-accent/5 shadow-trust-lg'
          : 'border-[#3a3840] bg-[#2a2830]'
      }`}
    >
      {highlighted && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-trust-accent text-white text-xs font-bold uppercase tracking-wider">
          Popular
        </span>
      )}

      <h3 className="text-lg font-semibold text-white mb-1">{name}</h3>

      <div className="flex items-baseline gap-1 mb-4">
        <span className="text-3xl font-bold text-white">${price}</span>
        <span className="text-gray-500 text-sm">{period}</span>
      </div>

      <ul className="space-y-2.5 mb-6">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
            <svg className="w-4 h-4 text-trust-green mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>

      <button
        onClick={onSelect}
        className={`w-full py-2.5 px-4 rounded-lg font-medium transition-colors ${
          highlighted
            ? 'bg-trust-accent hover:bg-trust-accent-hover text-white'
            : 'border border-[#3a3840] text-gray-300 hover:text-white hover:border-gray-500'
        }`}
      >
        Seleccionar
      </button>
    </div>
  );
}
