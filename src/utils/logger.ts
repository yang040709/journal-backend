import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import dotenv from "dotenv";

// 加载环境变量
dotenv.config();

// 日志级别定义
export enum LogLevel {
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  DEBUG = "debug",
}

// 日志格式接口
export interface LogContext {
  requestId?: string;
  userId?: string;
  method?: string;
  url?: string;
  responseTime?: number;
  error?: Error;
  [key: string]: any;
}

// 创建日志格式
const createLogFormat = (isDevelopment: boolean) => {
  if (isDevelopment) {
    // 开发环境：彩色控制台输出 + 结构化JSON文件输出
    return {
      console: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const { requestId, userId, method, url, responseTime, ...restMeta } =
            meta;
          let logMessage = `${timestamp} ${level}: ${message}`;

          if (requestId) logMessage += ` [${requestId}]`;
          if (userId) logMessage += ` user:${userId}`;
          if (method && url) logMessage += ` ${method} ${url}`;
          if (responseTime) logMessage += ` ${responseTime}ms`;

          if (Object.keys(restMeta).length > 0) {
            logMessage += ` ${JSON.stringify(restMeta, null, 2)}`;
          }

          return logMessage;
        }),
      ),
      file: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    };
  } else {
    // 生产环境：结构化JSON输出
    return {
      console: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      file: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    };
  }
};

// 创建日志传输器
const createTransports = (isDevelopment: boolean) => {
  const logDir = process.env.LOG_DIR || "./logs";
  const maxSize = process.env.LOG_MAX_SIZE || "10m";
  const maxFiles = process.env.LOG_MAX_FILES || "14d";

  const transports: winston.transport[] = [
    // 控制台输出
    new winston.transports.Console({
      format: createLogFormat(isDevelopment).console,
    }),
    // 按天轮转的错误日志
    new DailyRotateFile({
      filename: path.join(logDir, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize,
      maxFiles,
      level: LogLevel.ERROR,
      format: createLogFormat(isDevelopment).file,
    }),
    // 按天轮转的完整日志
    new DailyRotateFile({
      filename: path.join(logDir, "combined-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize,
      maxFiles,
      format: createLogFormat(isDevelopment).file,
    }),
  ];

  return transports;
};

// 创建日志实例
const isDevelopment = process.env.NODE_ENV === "development";

const logLevel =
  process.env.LOG_LEVEL || (isDevelopment ? LogLevel.DEBUG : LogLevel.INFO);

export const logger = winston.createLogger({
  level: logLevel,
  levels: {
    [LogLevel.ERROR]: 0,
    [LogLevel.WARN]: 1,
    [LogLevel.INFO]: 2,
    [LogLevel.DEBUG]: 3,
  },
  transports: createTransports(isDevelopment),
  // 处理未捕获的异常
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(process.env.LOG_DIR || "./logs", "exceptions.log"),
    }),
  ],
  // 处理未处理的Promise拒绝
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(process.env.LOG_DIR || "./logs", "rejections.log"),
    }),
  ],
  // 不退出进程
  exitOnError: false,
});

// 向后兼容的console接口
export const consoleCompat = {
  log: (...args: any[]) => logger.info(args.join(" ")),
  error: (...args: any[]) => logger.error(args.join(" ")),
  warn: (...args: any[]) => logger.warn(args.join(" ")),
  info: (...args: any[]) => logger.info(args.join(" ")),
  debug: (...args: any[]) => logger.debug(args.join(" ")),
};

// 工具函数：创建带上下文的日志记录器
export const createContextLogger = (context: LogContext) => {
  return {
    error: (message: string, extra?: any) =>
      logger.error(message, { ...context, ...extra }),
    warn: (message: string, extra?: any) =>
      logger.warn(message, { ...context, ...extra }),
    info: (message: string, extra?: any) =>
      logger.info(message, { ...context, ...extra }),
    debug: (message: string, extra?: any) =>
      logger.debug(message, { ...context, ...extra }),
  };
};

// 工具函数：记录HTTP请求
export const logHttpRequest = (
  requestId: string,
  userId: string,
  method: string,
  url: string,
  statusCode: number,
  responseTime: number,
  extra?: any,
) => {
  const level =
    statusCode >= 500
      ? LogLevel.ERROR
      : statusCode >= 400
        ? LogLevel.WARN
        : LogLevel.INFO;

  logger.log(level, `${method} ${url} ${statusCode}`, {
    requestId,
    userId,
    method,
    url,
    statusCode,
    responseTime,
    ...extra,
  });
};

// 工具函数：记录错误
export const logError = (
  error: Error,
  context?: LogContext,
  message?: string,
) => {
  logger.error(message || error.message, {
    ...context,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  });
};

// 默认导出
export default logger;
