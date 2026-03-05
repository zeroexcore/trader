import { Command } from 'commander';
import { requirePassword as _requirePassword, getRpcUrl as _getRpcUrl } from '../config.js';

// Root program reference for global options (--md)
let rootProgram: Command | null = null;

export function setRootProgram(program: Command): void {
  rootProgram = program;
}

function getOpts(): { md?: boolean } {
  return rootProgram?.opts() ?? {};
}

/** Output helper - JSON by default, markdown with --md */
export function output(data: any, mdFormatter?: () => string): void {
  if (getOpts().md && mdFormatter) {
    console.log(mdFormatter());
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

/** Error output and exit */
export function error(message: string, details?: any): never {
  if (getOpts().md) {
    console.error(`Error: ${message}`);
    if (details) console.error(details);
  } else {
    console.log(JSON.stringify({ error: message, details }, null, 2));
  }
  process.exit(1);
}

/**
 * Wrap a commander action so it gets automatic try/catch + structured error output.
 * Commands no longer need their own try/catch blocks.
 *
 * Usage:
 *   new Command('foo').action(action(async (arg, options) => { ... }))
 */
export function action(fn: (...args: any[]) => Promise<void> | void) {
  return async (...args: any[]) => {
    try {
      await fn(...args);
    } catch (e: any) {
      error(e.message || 'Unknown error', e.cause || undefined);
    }
  };
}

// Re-export config helpers for backward compat with command files
export const requirePassword = _requirePassword;
export const getRpcUrl = _getRpcUrl;
