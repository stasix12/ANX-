# The worker, off the owner's PC.
#
# WHAT THIS REPLACES. Until now the publishing engine ran as a black window on
# a computer in Be'er Sheva that had to stay awake. That is the single thing
# standing between this product and a second customer: every customer needed a
# computer of their own, left on. This image is that computer.
#
# Playwright's own base image, pinned to the version in package.json, because
# the browser and the library are one thing: a mismatch here is a worker that
# starts, reports healthy, and cannot drive a page.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

# Asia/Jerusalem at the OS level as well as in the browser. The page's clock is
# set by Playwright (SOCIAL_BROWSER_TIMEZONE); this one is for the log lines
# and the daily caps, which are the owner's day, not UTC's.
ENV TZ=Asia/Jerusalem
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# ONLY WHAT THE WORKER IMPORTS, and that turns out to be two packages.
#
# The first version installed the whole product's lockfile — next, react, the
# Tailwind toolchain, all of it — into a process that imports none of them.
# Every module the worker reaches for outside Node's own library is
# @supabase/supabase-js or playwright-core; the shared planning code it pulls
# from src/ is plain TypeScript with no framework in it, which is exactly why
# the dashboard and the worker can never disagree about the rules.
#
# Installing the rest was not only waste, it was the build failure: npm died
# with "Exit handler never called!" — its own bug — while resolving a tree
# this image has no use for.
#
# Versions pinned to what the repository resolves today, so the image cannot
# quietly drift to a different browser library than the tests ran against.
RUN npm i --no-audit --no-fund --omit=optional \
      @supabase/supabase-js@2.112.3 \
      playwright-core@1.49.0 \
      tsx@4.23.13 \
      typescript@5.9.3

# Only what the worker needs to run. src/ comes along because the worker
# imports the shared rules and types from it — the same planner the dashboard
# uses, which is the whole reason the two can never disagree.
COPY tsconfig.json package.json ./
COPY worker ./worker
COPY src ./src

# The Facebook session lives here, and it MUST be a mounted volume. Everything
# that makes this browser a known, trusted signed-in device is in this
# directory: cookies, local storage, the device id Facebook remembers. Lose it
# and the next start is a fresh login from a new address — which is the one
# thing most likely to raise a security check.
ENV SOCIAL_BROWSER_PROFILE_DIR=/data/facebook-profile
VOLUME ["/data"]

# Playwright's own Chromium, not Google Chrome: there is no Chrome in this
# image and no reason to add one.
ENV SOCIAL_BROWSER_CHANNEL=chromium

# Headless always. There is no screen here, and the dashboard's Debug Mode
# would otherwise try to open a window onto one that does not exist.
ENV SOCIAL_BROWSER_HEADED=0

CMD ["npx", "tsx", "worker/social-worker.ts"]
