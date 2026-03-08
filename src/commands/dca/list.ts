import { Command } from 'commander';
import { getWalletAddress } from '../../utils/wallet.js';
import { getTickerFromAddress } from '../../utils/token-book.js';
import { getRecurringOrders, type RecurringOrder } from '../../utils/recurring.js';
import { output, action, requirePassword } from '../shared.js';

function formatOrder(order: RecurringOrder): string {
  const fromTicker = getTickerFromAddress(order.inputMint) || order.inputMint.slice(0, 8) + '...';
  const toTicker = getTickerFromAddress(order.outputMint) || order.outputMint.slice(0, 8) + '...';
  const freq = parseInt(order.cycleFrequency, 10);
  const intervalHours = freq / 3600;
  const intervalStr = intervalHours >= 24 ? `${intervalHours / 24}d` : intervalHours >= 1 ? `${intervalHours}h` : `${freq}s`;

  const lines = [
    `🟢 ${fromTicker} → ${toTicker}`,
    `   Order: ${order.orderKey}`,
    `   Per cycle: ${order.inAmountPerCycle} ${fromTicker} every ${intervalStr}`,
    `   Deposited: ${order.inDeposited} ${fromTicker} | Used: ${order.inUsed} ${fromTicker}`,
    `   Received: ${order.outReceived} ${toTicker}`,
    `   Created: ${order.createdAt}`,
  ];

  if (order.closedAt) lines.push(`   Closed: ${order.closedAt}`);

  return lines.join('\n');
}

export const listCommand = new Command('list')
  .option('--status <status>', 'Order status: active or history', 'active')
  .description('List DCA orders')
  .action(action(async (options) => {
    const password = requirePassword();
    const address = getWalletAddress(password);
    const status = options.status as 'active' | 'history';

    console.log(`\n📊 Fetching ${status} DCA orders for ${address}...\n`);

    const result = await getRecurringOrders(address, status);

    if (!result.orders || result.orders.length === 0) {
      output({ orders: [], total: 0 }, () => `📊 No ${status} DCA orders found.\n`);
      return;
    }

    output(result, () => {
      const lines = result.orders.map(order => formatOrder(order));
      return [
        ...lines,
        '',
        `═══════════════════════════════════════`,
        `📊 ${result.orders.length} order(s)`,
        '',
      ].join('\n');
    });
  }));
