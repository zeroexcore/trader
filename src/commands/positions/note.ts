import { Command } from 'commander';
import { getPosition, updatePositionNotes } from '../../utils/positions.js';
import { output } from '../shared.js';

export const noteCommand = new Command('note')
  .argument('<position-id>', 'Position ID')
  .argument('<note>', 'Note text')
  .description('Add a note to a position')
  .option('-a, --append', 'Append to existing notes instead of replacing')
  .action((positionId, note, options) => {
    updatePositionNotes(positionId, note, options.append);
    const position = getPosition(positionId);
    if (position) {
      output(
        { positionId, notes: position.notes },
        () => `# Note Updated\n\nPosition: ${positionId}\nNotes: ${position.notes}`
      );
    } else {
      output({ error: 'Position not found', positionId }, () => `Error: Position not found: ${positionId}`);
    }
  });
