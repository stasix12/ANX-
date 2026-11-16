/*
 * next/navigation, stood in for so the REAL login page can be mounted.
 *
 * The page is a client component that calls useRouter and useSearchParams.
 * Outside the Next runtime those throw, which is the only reason this file
 * exists — nothing here is under test. Everything the suite measures is the
 * page's own markup and the app's own stylesheet.
 */
export function useRouter() {
  return {
    replace: () => undefined,
    push: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    refresh: () => undefined,
    prefetch: () => undefined,
  };
}

export function useSearchParams() {
  return new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
}

export function usePathname() {
  return '/social/login';
}
