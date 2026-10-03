export type ConsoleLogLevel = 'log' | 'warn' | 'error' | 'info';

export interface ConsoleLogEntry {
  level: ConsoleLogLevel;
  message: string;
  timestamp: number;
}
