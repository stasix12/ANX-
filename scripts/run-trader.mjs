#!/usr/bin/env node
/**
 * Local runner for the day-trading engine: calls /api/trading/tick in a loop
 * against a running Next server (local `npm run dev` or the deployed site).
 * Use it when there is no Vercel cron — a laptop left open during US market
 * hours is enough, because each tick is stateless and the exits are bracket
 * orders held broker-side anyway.
 *
 *   TRADER_URL=https://your-site.vercel.app TRADING_API_SECRET=... npm run trader
 *
 * Defaults: http://localhost:3000, one tick per minute.
 */

const baseUrl = (process.env.TRADER_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const secret = process.env.TRADING_API_SECRET ?? '';
const intervalSec = Math.max(15, Number(process.env.TRADER_INTERVAL_SEC) || 60);

const stamp = () => new Date().toLocaleTimeString('en-GB');

async function tick() {
  try {
    const res = await fetch(`${baseUrl}/api/trading/tick`, {
      method: 'POST',
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
    });
    const body = await res.json().catch(() => ({}));
    console.log(`[${stamp()}] ${res.status} ${body.phase ?? ''} — ${body.message ?? ''}`);
    if (body.entered?.length) {
      for (const e of body.entered) {
        console.log(
          `[${stamp()}]   BUY ${e.symbol} x${e.qty} @ ~$${e.price.toFixed(2)} (TP $${e.takeProfit.toFixed(2)} / SL $${e.stopLoss.toFixed(2)})`,
        );
      }
    }
  } catch (error) {
    console.error(`[${stamp()}] tick failed: ${error.message}`);
  }
}

console.log(`Trader loop → ${baseUrl}/api/trading/tick every ${intervalSec}s. Ctrl+C to stop.`);
await tick();
setInterval(tick, intervalSec * 1000);
