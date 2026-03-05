import { Command } from 'commander';
import { listEvents, microToUsd } from '../../utils/prediction.js';

export const browseCommand = new Command('browse')
  .description('Discover popular and liquid prediction markets')
  .option('-c, --category <category>', 'Filter by category (crypto, politics, sports, esports, culture, economics, tech)')
  .option('-s, --status <status>', 'Filter by status (open, closed, settled)')
  .option('-l, --limit <number>', 'Number of results', '10')
  .action(async (options) => {
    try {
      console.log('\n🔮 Fetching prediction markets...\n');

      const result = await listEvents({
        category: options.category,
        status: options.status,
        limit: parseInt(options.limit),
      });

      if (!result.events || result.events.length === 0) {
        console.log('No events found.');
        return;
      }

      for (const event of result.events) {
        const statusEmoji = event.isActive ? '🟢' : '⚪';
        console.log(`${statusEmoji} ${event.metadata?.title || event.eventId}`);
        console.log(`   ID: ${event.eventId}`);
        console.log(`   Category: ${event.category}${event.subcategory ? ` > ${event.subcategory}` : ''}`);
        
        if (event.markets && event.markets.length > 0) {
          for (const market of event.markets.slice(0, 3)) { // Show first 3 markets
            const yesPrice = microToUsd(market.pricing?.buyYesPriceUsd || 0);
            const noPrice = microToUsd(market.pricing?.buyNoPriceUsd || 0);
            console.log(`   📊 ${market.metadata?.title || market.marketId}`);
            console.log(`      YES: ${yesPrice.times(100).toFixed(1)}% ($${yesPrice.toFixed(2)}) | NO: ${noPrice.times(100).toFixed(1)}% ($${noPrice.toFixed(2)})`);
            console.log(`      Market ID: ${market.marketId}`);
          }
          if (event.markets.length > 3) {
            console.log(`   ... and ${event.markets.length - 3} more markets`);
          }
        }
        console.log('');
      }

      console.log(`📊 Showing ${result.events.length} of ${result.total || result.events.length} events\n`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });
