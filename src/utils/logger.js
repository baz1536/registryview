const winston = require('winston');
const fs = require('fs');
const path = require('path');

const logsDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

function getTodayDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getCurrentLogFile() {
    return path.join(logsDir, `app-${getTodayDateString()}.log`);
}

const jsonFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: jsonFormat,
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        new winston.transports.File({
            filename: getCurrentLogFile(),
            format: jsonFormat
        })
    ]
});

// Daily log rotation
let currentDate = getTodayDateString();
setInterval(() => {
    const today = getTodayDateString();
    if (today !== currentDate) {
        currentDate = today;
        logger.transports.forEach(t => {
            if (t instanceof winston.transports.File) logger.remove(t);
        });
        logger.add(new winston.transports.File({ filename: getCurrentLogFile(), format: jsonFormat }));
        logger.info(`Log rotated to: ${getCurrentLogFile()}`);
    }
}, 60 * 1000);

module.exports = logger;
