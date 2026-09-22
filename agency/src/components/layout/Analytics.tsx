'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { analyticsIds } from '@/lib/analytics';
import { captureAttribution } from '@/lib/attribution';

/**
 * Third-party tags, each injected only when its ID is configured in .env.
 * Recommended production setup: only NEXT_PUBLIC_GTM_ID, and manage GA4,
 * Google Ads and Meta inside the container.
 */
export function Analytics() {
  const { gtm, ga4, gadsId, metaPixel } = analyticsIds;

  useEffect(() => {
    captureAttribution();
  }, []);

  // With GTM configured, GA4 / Ads / Meta are expected to live inside the
  // container — loading them here too would double count.
  const gtagIds = gtm ? [] : [ga4, gadsId].filter(Boolean);
  const pixel = gtm ? '' : metaPixel;

  return (
    <>
      {gtm ? (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');`}
        </Script>
      ) : null}

      {gtagIds.length > 0 ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gtagIds[0]}`} strategy="afterInteractive" />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());${gtagIds
              .map((id) => `gtag('config','${id}');`)
              .join('')}`}
          </Script>
        </>
      ) : null}

      {pixel ? (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              alt=""
              src={`https://www.facebook.com/tr?id=${pixel}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      ) : null}
    </>
  );
}

/** GTM's no-JS fallback; rendered at the top of <body>. */
export function GtmNoScript() {
  const { gtm } = analyticsIds;
  if (!gtm) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${gtm}`}
        height="0"
        width="0"
        style={{ display: 'none', visibility: 'hidden' }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
