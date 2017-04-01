const winston = require('winston');
['wxhack', 'main', 'uncaught'].forEach(label => {
    winston.loggers.add(label, {
        console: {
            level: 'info',
            colorize: true,
            label: label
        }
    })
});

const logger = winston.loggers.get('main');
const uncaught = winston.loggers.get('uncaught');
const express = require('express');
const morgan = require('morgan');
const { MongoClient } = require('mongodb');
const wxmsg = require('./wxmsg/wxmsg');
const config = require('./config/config.json');
const process = require('process');

process.on('uncaughtException', err => {
    uncaught.error(err);
});

(async () => {
    const wxmsg_router = new wxmsg(config.wxmsg);
    const db = await MongoClient.connect(config.dburl);

    await wxmsg_router.init(db);

    const app = express();

    app.use(morgan('tiny'));
    app.use(express.query());
    app.use('/wxmsg', wxmsg_router.router);

    app.listen(config.port);
})().then(() => {
    logger.info('Server starts');
}).catch(err => {
    if (err && err.MongoError)
        logger.error(err.MongoError);
    else
        logger.error(err);
});
