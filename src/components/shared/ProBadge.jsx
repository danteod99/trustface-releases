import React from 'react';

export default function ProBadge({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-full bg-trust-yellow/20 text-trust-yellow text-[10px] font-bold uppercase tracking-wider ${className}`}
    >
      PRO
    </span>
  );
}
