require('./lib/log');
const logger = require('winston').loggers.get('main');
const EventEmitter = require('events');
const http = require('http');
const express = require('express');
const morgan = require('morgan');
const { MongoClient } = require('mongodb');
const process = require('process');
const path = require('path');
const wxmsg = require('./lib/wxmsg/wxmsg');
const userdb = require('./lib/database/userdb');
const authdb = require('./lib/database/authdb');
const crawler = require('./lib/crawler/crawler');
const socket = require('./lib/socket/socket');

class Server {
    constructor(config) {
        this.config = config || {};
    }
    async start() {
        this.event_router = new EventEmitter();
        this.db = await MongoClient.connect(this.config.dburl);
        this.userdb = new userdb(this.event_router);
        this.authdb = new authdb(this.event_router, this.config.authdb);
        await this.userdb.init(this.db);
        await this.authdb.init(this.db);
        this.crawler = new crawler(this.event_router, this.userdb, this.config.crawler);
        await this.crawler.init();

        this.crawler.login();

        this.app = express();
        this.server = http.Server(this.app);
        this.socket = new socket(this.userdb, this.authdb, this.event_router, this.server, this.config.socket);
        this.config.handlers = this.config.handlers || {};
        this.wxmsg = new wxmsg({
            handlers: [
                new (require('./lib/handlers/wechat'))(this.config.handlers.wechat),
                new (require('./lib/handlers/updateuser'))(this.userdb),
                new (require('./lib/handlers/updatewall'))(this.userdb, this.config.handlers.update_wall),
                new (require('./lib/handlers/default'))()
            ]
        });
        this.app.use(morgan('tiny'));
        this.app.use(express.query());
        this.app.use('/wxmsg', this.wxmsg.router);
        if (this.config.server && this.config.server.public_path)
            this.app.use(this.config.server.base_path || '/', express.static(this.config.server.public_path));

        this.server.listen(this.config.port);
        logger.info('Server starts');
    }
    async exit() {
        if (this.db) {
            await this.db.close();
            delete this.db;
        }
        if (this.server) {
            await new Promise((resolve, reject) => this.server.close(resolve));
            delete this.server;
        }
        if (this.crawler) {
            await this.crawler.exit();
            delete this.crawler;
        }
        logger.info('Server stops');
    }
    async reset() {
        await this.exit();
        await this.start();
    }
}

let server = new Server(require('./config.json'));
server.start().catch(err => logger.error(err));

(() => {
    let second_time = false;
    process.on('SIGINT', () => {
        if (second_time) {
            logger.warn('Received SIGINT again. Force exit!');
            process.exit(1);
        } else {
            logger.info('Received SIGINT. Press CTRL-C again in 5s to force exit.');
            second_time = true;
            let timeout = setTimeout(() => second_time = false, 5000);
            server.exit().then(() => clearTimeout(timeout)).catch(err => logger.error(err));
        }
    });
})();
