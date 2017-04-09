const winston = require('winston');
const process = require('process');

['socket', 'updatewall', 'authdb', 'crawler', 'userdb', 'updateuser', 'wxhack', 'main', 'uncaught'].forEach(label => {
    winston.loggers.add(label, {
        console: {
            level: 'info',
            colorize: true,
            label: label
        }
    })
});

const logger = winston.loggers.get('uncaught');

process.on('uncaughtException', err => logger.error(err));
process.on('unhandledRejection', err => logger.error(err));
process.on('warning', warning => logger.warn(warning));
