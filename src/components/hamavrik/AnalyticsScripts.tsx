'use client';

import Script from 'next/script';
import { analytics } from '@/lib/hamavrik/config';

/**
 * Loads GA4 / Google Ads / Meta Pixel only when an ID is configured in
 * config.ts. With everything empty this renders nothing: no requests, no
 * cookies, no consent banner needed. Events are dispatched by track() in
 * lib/hamavrik/analytics.ts.
 */
export function AnalyticsScripts() {
  const gtagId = analytics.ga4MeasurementId || analytics.googleAdsId;
  const configs = [analytics.ga4MeasurementId, analytics.googleAdsId]
    .filter(Boolean)
    .map((id) => `gtag('config', '${id}');`)
    .join('\n');

  return (
    <>
      {gtagId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gtagId}`} strategy="afterInteractive" />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
${configs}`}
          </Script>
        </>
      ) : null}

      {analytics.metaPixelId ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${analytics.metaPixelId}');
fbq('track', 'PageView');`}
        </Script>
      ) : null}
    </>
  );
}
