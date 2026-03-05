import { Command } from 'commander';
import { getPositionsByTag } from '../../utils/positions.js';
import { output } from '../shared.js';

export const filterCommand = new Command('filter')
  .argument('<tag>', 'Tag to filter by')
  .description('List positions by tag')
  .action((tag) => {
    const pos = getPositionsByTag(tag);
    output(pos, () => {
      if (pos.length === 0) {
        return `# Positions by Tag\n\nNo positions found with tag: ${tag}`;
      }
      let md = `# Positions with tag "${tag}"\n\n`;
      for (const p of pos) {
        md += `- **${p.tokenSymbol}** (${p.type}): $${p.entryValueUsd.toFixed(2)} - ${p.status}\n`;
      }
      return md;
    });
  });
