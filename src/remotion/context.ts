import { createContext, useContext } from 'react';
import type { ReelProps } from '../shared/types';
import type { Model } from './model';

export type ReelCtx = {
  props: ReelProps;
  model: Model;
  hookFont: string; // CSS font-family stack
  subFont: string; // CSS font-family stack
};

export const ReelContext = createContext<ReelCtx | null>(null);

export const useReel = (): ReelCtx => {
  const ctx = useContext(ReelContext);
  if (!ctx) throw new Error('useReel() outside <Reel>');
  return ctx;
};
