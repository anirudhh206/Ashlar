/**
 * Notification Layer (Phase 4) — pages the Business Owner via Telegram when a workflow pauses
 * for exceeding its spend cap. One HTTP POST per notification, no other infra.
 */
const TELEGRAM_API = 'https://api.telegram.org';

export async function notifyOwner(message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn(
      '[notify] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — skipping real delivery. Message was:\n' +
        message,
    );
    return;
  }

  const response = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });

  if (!response.ok) {
    console.error(`[notify] Telegram delivery failed: ${response.status} ${await response.text()}`);
    return;
  }

  console.log('[notify] Telegram message sent to Business Owner.');
}
