import supportsColor from 'supports-color';

// https://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color

type ColorFunction = (str: string) => string;
type PrintFunction = (str: string) => void;

function withColorSupport(wrappedFunc: ColorFunction): ColorFunction {
  if (supportsColor.stdout && supportsColor.stderr) {
    return wrappedFunc;
  }
  return (msg: string) => msg;
}
const red = withColorSupport((str: string) => `\u001B[31m${str}\u001B[0m`);
const green = withColorSupport((str: string) => `\u001B[32m${str}\u001B[0m`);
const dim = withColorSupport((str: string) => `\u001B[90m${str}\u001B[0m`);
const underline = withColorSupport(
  (str: string) => `\u001B[36m\u001B[4m${str}\u001B[0m`,
);

export function logTag(project?: string): string {
  return project ? `[${project}] ` : '';
}

function printDuration(print: PrintFunction, startTime?: number): void {
  if (startTime) {
    print(dim(` (${Date.now() - startTime}ms)`));
  }
}

interface LoggerOptions {
  stderrPrint?: PrintFunction;
  print?: PrintFunction;
}

interface StartOptions {
  startTime?: number;
}

export default class Logger {
  private print: PrintFunction;
  private stderrPrint: PrintFunction;
  private startTime?: number | undefined;
  private startMsg?: string | undefined;

  constructor({
    stderrPrint = (str: string) => process.stderr.write(str),
    print = (str: string) => process.stdout.write(str),
  }: LoggerOptions = {}) {
    this.print = print;
    this.stderrPrint = stderrPrint;
    this.startTime = undefined;
    this.startMsg = undefined;
  }

  mute(): void {
    this.print = () => null;
    this.stderrPrint = () => null;
  }

  divider(): void {
    this.info('-----------------------------------------');
  }

  info(msg: string): void {
    this.print(`${msg}`.replaceAll(/https?:\/\/[^ ]+/g, underline));
    this.print('\n');
  }

  start(msg?: string, { startTime }: StartOptions = {}): void {
    this.startTime = startTime || Date.now();
    this.startMsg = msg;
    if (msg) {
      this.print(`Starting: ${msg} `);
      this.print('\n');
    }
  }

  success(msg?: string): void {
    this.print(green('✓'));

    if (this.startMsg) {
      this.print(green(` ${this.startMsg}:`));
    }

    if (msg) {
      this.print(green(` ${msg}`));
    }
    printDuration(this.print, this.startTime);
    this.print('\n');

    this.startMsg = undefined;
  }

  fail(msg?: string): void {
    this.print(red('✗'));

    if (this.startMsg) {
      this.print(red(` ${this.startMsg}:`));
    }

    if (msg) {
      this.print(red(` ${msg}`));
    }
    printDuration(this.print, this.startTime);
    this.print('\n');

    this.startMsg = undefined;
  }

  error(e: Error | string): void {
    let stack: string | undefined;
    if (typeof e === 'object' && e.stack) {
      stack = e.stack;
      if (stack) {
        stack = stack.split(`file://${process.cwd()}/`).join('');
      }
    }
    this.stderrPrint(
      red(stack || (typeof e === 'object' ? e.message : e) || String(e)),
    );
    this.stderrPrint('\n');
  }

  warn(message: string): void {
    this.stderrPrint(red(message));
    this.stderrPrint('\n');
  }
}
