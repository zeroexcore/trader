import { Command } from 'commander';
import { getMarket, microToUsd } from '../../utils/prediction.js';

export const marketCommand = new Command('market')
  .argument('<market-id>', 'Market ID')
  .description('Get detailed market information')
  .action(async (marketId) => {
    try {
      console.log(`\n📊 Fetching market details...\n`);

      const market = await getMarket(marketId);

      const yesPrice = microToUsd(market.pricing?.buyYesPriceUsd || 0);
      const noPrice = microToUsd(market.pricing?.buyNoPriceUsd || 0);
      const yesSellPrice = microToUsd(market.pricing?.sellYesPriceUsd || 0);
      const noSellPrice = microToUsd(market.pricing?.sellNoPriceUsd || 0);

      console.log(`╔════════════════════════════════════════════════════════════`);
      console.log(`║ ${market.metadata?.title || market.marketId}`);
      console.log(`║ ${market.marketId}`);
      console.log(`╚════════════════════════════════════════════════════════════\n`);

      console.log(`📜 STATUS: ${market.status.toUpperCase()}${market.result ? ` (Result: ${market.result.toUpperCase()})` : ''}\n`);

      console.log(`💰 PRICES`);
      console.log(`   YES: Buy $${yesPrice.toFixed(2)} (${yesPrice.times(100).toFixed(1)}%) | Sell $${yesSellPrice.toFixed(2)}`);
      console.log(`   NO:  Buy $${noPrice.toFixed(2)} (${noPrice.times(100).toFixed(1)}%) | Sell $${noSellPrice.toFixed(2)}\n`);

      if (market.pricing?.volume) {
        console.log(`📈 VOLUME: $${microToUsd(market.pricing.volume).toFixed(2)}`);
      }

      if (market.metadata?.rulesPrimary) {
        console.log(`\n📝 RULES`);
        console.log(`   ${market.metadata.rulesPrimary.slice(0, 200)}...`);
      }

      console.log(`\n💡 To bet: trader predict buy ${marketId} <yes|no> <amount>`);
      console.log('');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });
