import axios from "axios";

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

type AlertJob = { content: string; };

const queue: AlertJob[] = [];
let isProcessing = false;
const DELAY_MS = 350; // ~2.8 messages/sec

export function sendDiscordAlert(content: string): void {
  if (!webhookUrl) {
    console.warn("⚠️ DISCORD_WEBHOOK_URL is not set");
    return;
  }

  queue.push({ content });
  if (!isProcessing) {
    processQueue();
  }
}

async function processQueue() {
  isProcessing = true;

  while (queue.length > 0) {
    const { content } = queue.shift()!;
    try {
      await axios.post(webhookUrl!, { content });
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { retry_after?: number } }; message?: string };
      if (error?.response?.status === 429) {
        const retry = typeof error.response.data?.retry_after === 'number' 
          ? error.response.data.retry_after 
          : 1000;
        console.warn(`⏳ Rate limited. Retrying after ${retry}ms`);
        await wait(retry);
        queue.unshift({ content }); // Re-queue the failed message
        continue;
      } else {
        console.error("❌ Failed to send Discord alert:", error.message || String(err));
      }
    }

    await wait(DELAY_MS);
  }

  isProcessing = false;
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
