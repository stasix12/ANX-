#!/usr/bin/env bash
# הקמת שרת לקוחות בפקודה אחת — Ubuntu/Debian נקי (Hetzner, DigitalOcean...).
#
# What one SSH session has to cover, so it is short and repeatable:
#   1. Docker, from Docker's own install script (the distro's is often stale);
#   2. the repository, cloned or pulled;
#   3. the customer env files checked for, loudly, BEFORE compose runs —
#      a worker that starts with example credentials spins on a login error
#      and the log is the only place that says why.
#
# Usage, on a fresh server:
#   git clone <repo-url> app && cd app && bash worker/setup-vps.sh
# Or re-run after adding a customer env file — it is idempotent.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "[setup] מתקין Docker..."
  curl -fsSL https://get.docker.com | sh
fi

COMPOSE=worker/docker-compose.customers.yml
missing=0
for f in $(grep -oE 'customers/customer[0-9]+\.env' "$COMPOSE" | sort -u); do
  if [ ! -f "worker/$f" ]; then
    echo "[setup] חסר worker/$f — העתיקו מ-worker/customers/customer1.env.example ומלאו."
    missing=1
  fi
done
if [ "$missing" = "1" ]; then
  echo "[setup] עצרתי לפני ההרצה: למלא את הקבצים החסרים (או למחוק את הבלוקים שלהם מה-compose) ולהריץ שוב."
  exit 1
fi

echo "[setup] בונה ומרים את כל ה-workers..."
docker compose -f "$COMPOSE" up -d --build
echo
docker compose -f "$COMPOSE" ps
echo
echo "[setup] זהו. לוגים של לקוח:  docker compose -f $COMPOSE logs -f customer1"
echo "[setup] כל לקוח מעלה את פרופיל הפייסבוק שלו דרך עמוד החשבון באפליקציה — מהמחשב שלו."
