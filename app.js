const winston = require('winston');
['crawler', 'userdb', 'updatedb', 'wxhack', 'main'].forEach(label => {
    winston.loggers.add(label, {
        console: {
            level: 'info',
            colorize: true,
            label: label
        }
    })
});
const logger = winston.loggers.get('main');
const process = require('process');
process.on('uncaughtException', err => {
    logger.error(err);
});
process.on('unhandledRejection', err => {
    logger.error(err);
});
process.on('warning', warning => {
    logger.warn(warning);
});
process.on('SIGINT', () => {
    console.log('Received SIGINT. Exit!');
    process.exit(0);
});
const EventEmitter = require('events');
const express = require('express');
const morgan = require('morgan');
const { MongoClient } = require('mongodb');
const wxmsg = require('./lib/wxmsg/wxmsg');
const userdb = require('./lib/database/userdb');
const crawler = require('./lib/crawler/crawler');

let config = require('./config.json');

(async () => {
    const event_router = new EventEmitter();

    const db = await MongoClient.connect(config.dburl);
    const users = new userdb(event_router);
    await users.init(db);
    const crawl = new crawler(event_router, users, config.crawler);
    await crawl.init();

    crawl.login();

    config.wxmsg.handlers.updatedb = {
        userdb: users
    };

    const app = express();

    app.use(morgan('tiny'));
    app.use(express.query());
    app.use('/wxmsg', wxmsg(config.wxmsg));
    app.listen(config.port);
})().then(() => {
    logger.info('Server starts');
}).catch(err => {
    logger.error(err);
});
