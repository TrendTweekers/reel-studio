import { useEffect, useState } from 'react';
import { api, type LicenceState } from './api';
import { fmt, useT } from './i18n';

// Where to buy and where to renew. The portal link is a placeholder until the Polar org slug is final.
export const BUY_URL = 'https://klipownia.pl/#cena';
export const RENEW_URL = 'https://polar.sh/klipownia/portal';

export type Access = NonNullable<LicenceState['access']>;
export const isStopped = (a: Access | undefined | null) => a === 'blocked' || a === 'trial_ended';

// One shared copy for the whole page, so Home, Editor and Settings agree without asking twice.
let cached: LicenceState | null = null;
const subs = new Set<(l: LicenceState) => void>();
export const setLicence = (l: LicenceState) => {
  cached = l;
  subs.forEach((f) => f(l));
};
export const refreshLicence = () =>
  api.licence().then(setLicence, () => undefined); // an older server has no licence route: no banner

export function useLicence(): LicenceState | null {
  const [lic, setLic] = useState<LicenceState | null>(cached);
  useEffect(() => {
    subs.add(setLic);
    void refreshLicence();
    return () => {
      subs.delete(setLic);
    };
  }, []);
  return lic;
}

// The plain sentence for a stopped tool (also shown on the render button).
export function useStopText(): string | null {
  const { t } = useT();
  const lic = useLicence();
  if (lic?.access === 'blocked') return t('licBlocked');
  if (lic?.access === 'trial_ended') return t('licTrialEnded');
  return null;
}

// Slim strip under the top bar: trial days, a lapsed subscription, or why new videos are stopped.
export function LicenceBanner() {
  const { t } = useT();
  const lic = useLicence();
  if (!lic?.access || lic.access === 'full') return null;
  const n = lic.daysLeft ?? 0;
  const days = (key: 'licTrial' | 'licGrace') => fmt(t(n === 1 ? `${key}One` : key), { n });
  const [text, href, link] =
    lic.access === 'trial'
      ? [days('licTrial'), BUY_URL, t('licBuy')]
      : lic.access === 'grace'
        ? [days('licGrace'), RENEW_URL, t('licRenew')]
        : lic.access === 'blocked'
          ? [t('licBlocked'), RENEW_URL, t('licRenew')]
          : [t('licTrialEnded'), BUY_URL, t('licBuy')];
  return (
    <div className={`lic-banner lic-${lic.access}`} role={isStopped(lic.access) ? 'alert' : 'status'}>
      <span>{text}</span>
      <a className="lic-link" href={href} target="_blank" rel="noreferrer">
        {link}
      </a>
    </div>
  );
}
