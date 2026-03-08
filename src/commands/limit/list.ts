import { Command } from 'commander';
import { getWalletAddress } from '../../utils/wallet.js';
import { getTickerFromAddress } from '../../utils/token-book.js';
import { getTriggerOrders } from '../../utils/trigger.js';
import type { TriggerOrder } from '../../utils/trigger.js';
import { output, action, requirePassword } from '../shared.js';

export const listCommand = new Command('list')
  .option('--status <status>', 'Order status: active or history', 'active')
  .description('List limit orders')
  .action(action(async (options) => {
    const password = requirePassword();
    const address = getWalletAddress(password);
    const status = options.status === 'history' ? 'history' as const : 'active' as const;

    console.log(`\n🔮 Fetching ${status} limit orders for ${address}...\n`);

    const result = await getTriggerOrders(address, status);

    if (!result.orders || result.orders.length === 0) {
      console.log('📊 No orders found');
      return;
    }

    output(result, () => formatOrders(result.orders, status));
  }));

function formatOrders(orders: TriggerOrder[], status: string): string {
  let out = `## Limit Orders (${status})\n\n`;

  for (const order of orders) {
    const inputTicker = getTickerFromAddress(order.inputMint) || order.inputMint.slice(0, 8) + '…';
    const outputTicker = getTickerFromAddress(order.outputMint) || order.outputMint.slice(0, 8) + '…';

    // API returns human-readable amounts directly
    out += `### ${inputTicker} → ${outputTicker}\n`;
    out += `- **Order:** \`${order.orderKey}\`\n`;
    out += `- **Status:** ${order.status}\n`;
    out += `- **Selling:** ${order.makingAmount} ${inputTicker} (remaining: ${order.remainingMakingAmount})\n`;
    out += `- **Buying:** ${order.takingAmount} ${outputTicker}\n`;

    if (order.expiredAt) {
      out += `- **Expires:** ${order.expiredAt}\n`;
    }

    out += `- **Created:** ${order.createdAt}\n\n`;
  }

  out += `**Total:** ${orders.length} order(s)`;
  return out;
}
