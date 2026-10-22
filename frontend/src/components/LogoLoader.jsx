import React from 'react';

export default function LogoLoader({ size = "md", text = "Loading..." }) {
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-10 h-10",
    lg: "w-16 h-16",
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      {/* Rotating Logo Animation */}
      <div className={`${sizeClasses[size] || sizeClasses.md} border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-2`} />
      {text && <span className="text-xs font-semibold text-slate-500 tracking-wider">{text}</span>}
    </div>
  );
}