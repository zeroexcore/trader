import { Command } from 'commander';
import { addPositionTags, getPosition } from '../../utils/positions.js';
import { output } from '../shared.js';

export const tagCommand = new Command('tag')
  .argument('<position-id>', 'Position ID')
  .argument('<tags>', 'Comma-separated tags')
  .description('Add tags to a position')
  .action((positionId, tags) => {
    const tagList = tags.split(',').map((t: string) => t.trim());
    addPositionTags(positionId, tagList);
    const position = getPosition(positionId);
    if (position) {
      output(
        { positionId, tags: position.tags },
        () => `# Tags Updated\n\nPosition: ${positionId}\nTags: ${position.tags?.join(', ')}`
      );
    } else {
      output({ error: 'Position not found', positionId }, () => `Error: Position not found: ${positionId}`);
    }
  });
