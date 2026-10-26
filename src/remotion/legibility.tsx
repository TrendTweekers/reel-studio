// One legibility system for every text that sits on footage: a layered soft shadow and an
// optional soft scrim (a feathered dark — or cream, for dark text — glow behind the block).
// It keeps the type elegant on cream walls, white jeans and window light.
import React from 'react';
import { isDark } from './color';
import type { Rect } from './model';

export const shadowFor = (textColor: string) =>
  isDark(textColor)
    ? '0 0 1px rgba(255,250,242,0.7), 0 2px 10px rgba(255,250,242,0.55), 0 6px 26px rgba(255,250,242,0.4)'
    : '0 0 1px rgba(0,0,0,0.65), 0 1px 2px rgba(0,0,0,0.5), 0 3px 10px rgba(0,0,0,0.38), 0 8px 30px rgba(0,0,0,0.32)';

// For text painted with background-clip (karaoke): text-shadow would show through, so use filters.
export const dropFilterFor = (textColor: string) =>
  isDark(textColor)
    ? 'drop-shadow(0 0 1px rgba(255,250,242,0.7)) drop-shadow(0 3px 12px rgba(255,250,242,0.5))'
    : 'drop-shadow(0 0 1px rgba(0,0,0,0.7)) drop-shadow(0 2px 3px rgba(0,0,0,0.45)) drop-shadow(0 6px 20px rgba(0,0,0,0.32))';

export const Scrim: React.FC<{ rect: Rect; textColor: string; opacity?: number; spreadX?: number; spreadY?: number }> = ({
  rect,
  textColor,
  opacity = 1,
  spreadX = 130,
  spreadY = 90,
}) => {
  const c = isDark(textColor) ? '250,245,236' : '10,8,6';
  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x - spreadX,
        top: rect.y - spreadY,
        width: rect.w + spreadX * 2,
        height: rect.h + spreadY * 2,
        opacity,
        background: `radial-gradient(closest-side, rgba(${c},0.42) 0%, rgba(${c},0.30) 45%, rgba(${c},0.12) 75%, rgba(${c},0) 100%)`,
        pointerEvents: 'none',
      }}
    />
  );
};
