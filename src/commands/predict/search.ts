import { Command } from 'commander';
import { searchEvents, microToUsd } from '../../utils/prediction.js';

export const searchCommand = new Command('search')
  .argument('<query>', 'Search query')
  .description('Search for prediction events')
  .action(async (query) => {
    try {
      console.log(`\n🔍 Searching for "${query}"...\n`);

      const result = await searchEvents(query);

      if (!result.events || result.events.length === 0) {
        console.log('No events found matching your search.');
        return;
      }

      for (const event of result.events) {
        const statusEmoji = event.isActive ? '🟢' : '⚪';
        console.log(`${statusEmoji} ${event.metadata?.title || event.eventId}`);
        console.log(`   ID: ${event.eventId}`);
        
        if (event.markets && event.markets.length > 0) {
          for (const market of event.markets.slice(0, 3)) {
            const yesPrice = microToUsd(market.pricing?.buyYesPriceUsd || 0);
            console.log(`   📊 ${market.metadata?.title}: YES ${yesPrice.times(100).toFixed(1)}% | Market: ${market.marketId}`);
          }
        }
        console.log('');
      }
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });
