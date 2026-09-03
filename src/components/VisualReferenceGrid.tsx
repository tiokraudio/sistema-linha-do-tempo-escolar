import React from 'react';

interface VisualReferenceGridProps {
  show?: boolean;
}

export const VisualReferenceGrid: React.FC<VisualReferenceGridProps> = ({ show = true }) => {
  if (!show) return null;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 90,
        pointerEvents: 'none',
      }}
      className="absolute inset-0 w-full h-full z-[90] pointer-events-none"
    >
      {/* 5% Grid Lines */}
      {Array.from({ length: 19 }, (_, i) => (i + 1) * 5).map((pos) => {
        const isCenter = pos === 50;
        return (
          <React.Fragment key={`grid_line_${pos}`}>
            {/* Vertical line at pos% */}
            <line
              x1={pos}
              y1={0}
              x2={pos}
              y2={100}
              stroke={isCenter ? 'rgba(37, 99, 235, 0.85)' : 'rgba(59, 130, 246, 0.25)'}
              strokeWidth={isCenter ? 0.35 : 0.15}
              strokeDasharray={isCenter ? undefined : '0.6 0.6'}
            />
            {/* Horizontal line at pos% */}
            <line
              x1={0}
              y1={pos}
              x2={100}
              y2={pos}
              stroke={isCenter ? 'rgba(37, 99, 235, 0.85)' : 'rgba(59, 130, 246, 0.25)'}
              strokeWidth={isCenter ? 0.35 : 0.15}
              strokeDasharray={isCenter ? undefined : '0.6 0.6'}
            />
          </React.Fragment>
        );
      })}
      {/* Center intersection dot */}
      <circle cx="50" cy="50" r="0.7" fill="rgba(37, 99, 235, 0.9)" />
    </svg>
  );
};
