/**
 * Logger Utility
 * Scoped debug logging with prefixes
 */

const logLevels = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

let currentLevel = logLevels.INFO;

/**
 * Set log level
 * @param {'ERROR'|'WARN'|'INFO'|'DEBUG'} level - Log level
 */
export function setLogLevel(level) {
  currentLevel = logLevels[level] || logLevels.INFO;
}

/**
 * Create scoped logger
 * @param {string} scope - Logger scope (e.g., 'Appointments', 'Invoices')
 * @returns {Object} Logger methods
 */
export function createLogger(scope) {
  const prefix = `[${scope}]`;
  
  return {
    error: (...args) => {
      if (currentLevel >= logLevels.ERROR) {
        console.error(prefix, ...args);
      }
    },
    warn: (...args) => {
      if (currentLevel >= logLevels.WARN) {
        console.warn(prefix, ...args);
      }
    },
    info: (...args) => {
      if (currentLevel >= logLevels.INFO) {
        console.log(prefix, ...args);
      }
    },
    debug: (...args) => {
      if (currentLevel >= logLevels.DEBUG) {
        console.log(prefix, ...args);
      }
    },
    log: (...args) => {
      console.log(prefix, ...args);
    }
  };
}

/**
 * Default logger
 */
export const logger = createLogger('App');
