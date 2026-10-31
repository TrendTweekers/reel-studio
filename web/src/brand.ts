import { createContext, useContext } from 'react';
import type { BrandSettings } from '../../src/shared/types';
import { api, HttpError } from './api';

// Who uses this copy of Klipownia (name, handle, what for). Loaded once by App and shared here.

export const DEFAULT_BRAND: BrandSettings = { name: '', language: 'pl', use: 'both', done: false };

// An older server has no /api/settings/brand yet. Then the page keeps the brand in this browser,
// so the setup still works and nothing crashes.
const LOCAL_KEY = 'reel-studio-brand';
const readLocal = (): BrandSettings | null => {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? { ...DEFAULT_BRAND, ...(JSON.parse(raw) as Partial<BrandSettings>) } : null;
  } catch {
    return null;
  }
};
const writeLocal = (b: BrandSettings) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(b));
  } catch {
    /* private window */
  }
};

export async function loadBrand(): Promise<BrandSettings> {
  try {
    return { ...DEFAULT_BRAND, ...(await api.brand()) };
  } catch (e) {
    // 404 = no route yet: "setup not done" unless this browser has a copy.
    if (e instanceof HttpError) return readLocal() ?? DEFAULT_BRAND;
    throw e;
  }
}

export async function storeBrand(b: BrandSettings): Promise<BrandSettings> {
  try {
    const saved = { ...DEFAULT_BRAND, ...(await api.saveBrand(b)) };
    writeLocal(saved);
    return saved;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) {
      writeLocal(b);
      return b;
    }
    throw e;
  }
}

export type BrandCtx = {
  brand: BrandSettings;
  loaded: boolean;
  // Saves on the server and updates every page.
  saveBrand: (b: BrandSettings) => Promise<BrandSettings>;
};
export const BrandContext = createContext<BrandCtx>({ brand: DEFAULT_BRAND, loaded: false, saveBrand: async (b) => b });
export const useBrand = () => useContext(BrandContext);

// "@name" for the page, whatever she typed.
export const atHandle = (h?: string) => (h ? `@${h.replace(/^@+/, '')}` : '');

// Accent colours offered in the setup and in Settings.
export const ACCENTS = ['#7b2d3b', '#1b1715', '#b5562f', '#c08a2e', '#2f5a45', '#2b3f6b', '#6b4c8a'];
