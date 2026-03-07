import { output, error, action, setRootProgram } from './shared.js';
import { Command } from 'commander';

// Mock config re-exports so the module loads cleanly
vi.mock('../config.js', () => ({
  requirePassword: vi.fn(() => 'pw'),
  getRpcUrl: vi.fn(() => 'https://rpc.test'),
}));

describe('output()', () => {
  it('calls console.log with JSON by default', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const data = { foo: 'bar' };

    output(data);

    expect(spy).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
  });

  it('calls mdFormatter when --md is set', () => {
    // Create a root program with --md option set
    const program = new Command();
    program.option('--md');
    program.parse(['--md'], { from: 'user' });
    setRootProgram(program);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const formatter = () => '# Hello markdown';

    output({ raw: true }, formatter);

    expect(spy).toHaveBeenCalledWith('# Hello markdown');

    // Reset root program
    setRootProgram(new Command());
  });
});

describe('error()', () => {
  it('calls process.exit(1)', () => {
    // Reset to non-md mode
    setRootProgram(new Command());

    vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    try {
      error('something broke');
    } catch {
      // error() calls process.exit which we mocked to not throw
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('outputs JSON error in non-md mode', () => {
    setRootProgram(new Command());

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    try {
      error('bad input', { code: 42 });
    } catch {
      // swallow
    }

    const logged = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(logged);
    expect(parsed.error).toBe('bad input');
    expect(parsed.details).toEqual({ code: 42 });
  });
});

describe('action()', () => {
  it('catches thrown errors and calls error()', async () => {
    setRootProgram(new Command());

    vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    const failingFn = async () => { throw new Error('boom'); };
    const wrapped = action(failingFn);

    await wrapped();

    // error() should have been called, which calls process.exit(1)
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('passes arguments through to the wrapped function', async () => {
    const fn = vi.fn(async (arg1: string, arg2: number) => {});
    const wrapped = action(fn);

    await wrapped('hello', 42);

    expect(fn).toHaveBeenCalledWith('hello', 42);
  });
});
