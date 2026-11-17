// Petits composants partagés.
import React from 'react';
import { statutInfo } from './finance.js';

export const inputBase = 'px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300';
export const inputCls = `${inputBase} w-full`;

export function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

export function Card({ title, right, children, className = '' }) {
  return (
    <section className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-4 ${className}`}>
      {(title || right) && (
        <div className="flex items-center gap-2 mb-3">
          {title && <h2 className="font-bold text-slate-800">{title}</h2>}
          {right && <div className="ml-auto">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-800', emerald: 'text-emerald-700', rose: 'text-rose-700', amber: 'text-amber-700', sky: 'text-sky-700',
  };
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export function StatutBadge({ statut }) {
  const s = statutInfo(statut);
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${s.cls}`}>{s.emoji} {s.label}</span>;
}

export const pct = (n) => `${(Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

export const fmtDate = (d) => (d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('fr-FR') : '—');
