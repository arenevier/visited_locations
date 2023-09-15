import * as path from 'node:path';
import { open, mkdir } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

import { APP_ROOT } from './constants';

enum LogLevel {
  Debug = "DEBUG",
  Log = "LOG",
  Error = "ERROR",
}

const logFilePath = `${APP_ROOT}/logs/log.txt`;

let fd: FileHandle | undefined;

function logToConsole(message: string, stackTrace: string[]) {
  for (const trace of stackTrace) {
    console.log(` ${trace}`);
  }
  console.log(message);
}

async function logToFile(message: string, stackTrace: string[]) {
  if (fd == null) {
    throw new Error('trying to use logger without initializing it');
  }
  const lines = stackTrace.map(str => ` ${str}`).concat(message);
  await fd.write(lines.join('\n') + '\n');
}

// eslint-disable-next-line @typescript-eslint/ban-types
function getStackTrace(bottom?: Function, n = -1): string[] {
  const dummy = new Error();
  Error.captureStackTrace(dummy, bottom);
  if (dummy.stack == null) {
    return [];
  }
  const stack = dummy.stack.split("\n");
  // remove first line: it just contains "Error"
  return stack.slice(1, n >= 0 ? n + 1 : stack.length).map(str => str.trim());
}

function levelToEmoji(level: LogLevel): string {
  switch (level) {
    case LogLevel.Debug:
      // https://www.compart.com/en/unicode/U+1F41E
      return '🐞';
    case LogLevel.Log:
      // https://www.compart.com/en/unicode/U+2139
      return 'ℹ️';
    case LogLevel.Error:
      // https://www.compart.com/en/unicode/U+274C
      return '❌';
  }
}

async function logWithLogLevel(level: LogLevel, message: string, stackTrace: string[]) {
  const messageForConsole = `${levelToEmoji(level)}  ${message}`;
  logToConsole(messageForConsole, stackTrace);

  const messageForFile = `${(new Date()).toISOString()} ${level}: ${message}`;
  await logToFile(messageForFile, stackTrace);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function error(...message: any[]) {
  const stackTrace = getStackTrace(error, -1);
  const msgAsString = message.join(' ');
  // TODO: in order to not block, we do wait for file to be written before returning.
  // It means that the logs are not guaranteed to be written if the processe terminates.
  // what is node way of making sure the file will be written on exit?
// eslint-disable-next-line @typescript-eslint/no-floating-promises
  logWithLogLevel(LogLevel.Error, msgAsString, stackTrace);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debug(...message: any[]) {
  const stackTrace = getStackTrace(debug, 1);
  const msgAsString = message.join(' ');
// eslint-disable-next-line @typescript-eslint/no-floating-promises
  logWithLogLevel(LogLevel.Debug, msgAsString, stackTrace);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function log(...message: any[]) {
  const stackTrace = getStackTrace(log, 1);
  const msgAsString = message.join(' ');
// eslint-disable-next-line @typescript-eslint/no-floating-promises
  logWithLogLevel(LogLevel.Log, msgAsString, stackTrace);
}

export async function init(logExceptions = false) {
  await mkdir(path.dirname(logFilePath), { recursive: true });
  fd = await open(logFilePath, 'a');

  if (logExceptions) {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    process.on('uncaughtException', async (err, _origin) => {
      const stackTrace = err.stack?.split("\n") ?? [];
      await logWithLogLevel(LogLevel.Error, err.toString(), stackTrace);
      process.exit(1);
    });

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    process.on('unhandledRejection', async (reason, _promise) => {
      if (reason instanceof Error) {
        const stackTrace = reason.stack?.split("\n") ?? [];
        await logWithLogLevel(LogLevel.Error, reason.toString(), stackTrace);
      } else {
        const stackTrace = getStackTrace();
        await logWithLogLevel(LogLevel.Error, String(reason), stackTrace);
      }
      process.exit(1);
    });
  }
}
