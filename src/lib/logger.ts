type LogLevel = "info" | "warn" | "error" | "debug";

interface LogData {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: unknown;
  error?: {
    message: string;
    stack?: string;
    cause?: unknown;
  };
}

function formatLog(level: LogLevel, message: string, data?: unknown): LogData {
  const logData: LogData = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };

  if (data instanceof Error) {
    logData.error = {
      message: data.message,
      stack: data.stack,
      cause: data.cause,
    };
  } else if (data !== undefined) {
    logData.data = data;
  }

  return logData;
}

export const logger = {
  info: (message: string, data?: unknown) => {
    const log = formatLog("info", message, data);
    console.log(JSON.stringify(log));
  },

  warn: (message: string, data?: unknown) => {
    const log = formatLog("warn", message, data);
    console.warn(JSON.stringify(log));
  },

  error: (message: string, error?: unknown) => {
    const log = formatLog("error", message, error);
    console.error(JSON.stringify(log));
  },

  debug: (message: string, data?: unknown) => {
    const log = formatLog("debug", message, data);
    console.debug(JSON.stringify(log));
  },
};
