const logger = require('winston').loggers.get('crawler');
const wxhack = require('./wxhack');
const os = require('os');
const fs = require('fs');
const path = require('path');

let timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = class {
    constructor(event_router, userdb, options) {
        options = options || {};
        if (!options.username || !options.password)
            throw new Error('Empty username or password.');

        this.media_dir = options.media_dir || os.tmpdir();
        this.polling = options.polling || false;
        this.polling_interval = options.polling_interval || 5000;
        this.fetching_timeout = options.fetching_timeout || 10000;
        this.reset_on_error = options.reset_on_error || true;

        this.event_router = event_router;
        this.userdb = userdb;

        this.logined = null;
        this.fetching = false;

        this.last_fetching_time = 0;
        this.last_message_time = 0;

        this.wxhack = new wxhack(options);
        this.unknown_users = {};
        this.event_router.on('new message from undetailed user', data => setTimeout(() => {
            if (this.unknown_users[data.user.openid])
                this.unknown_users[data.user.openid].push(data.message);
            else
                this.unknown_users[data.user.openid] = [data.message];
            this.last_message_time = Date.now();
            this.start();
        }, 0));
    }
    async init() {
        await this.wxhack.init();
    }
    async exit() {
        await this.wxhack.exit();
    }
    async reset() {
        logger.profile('reset()');
        await this.wxhack.reset();
        this.logined = null;
        logger.profile('reset()');
    }
    async login() {
        if (this.logined === null) {
            logger.profile('login()');
            this.logined = false;
            await this.wxhack.ensure_login();
            await this.wxhack.ensure_menu('消息管理');
            this.logined = true;
            logger.profile('login()');
        }
    }
    start() {
        if (this.logined && !this.fetching && Object.keys(this.unknown_users).length &&
            (this.polling || this.last_fetching_time < this.last_message_time)) {
            this.fetching = (async () => {
                await timeout(this.last_fetching_time + this.polling_interval - Date.now());
                this.last_fetching_time = Date.now();
                let fetch = this.fetch();
                await Promise.race([
                    fetch,
                    (async () => {
                        await timeout(this.fetching_timeout);
                        throw new Error('Fetch timeout');
                    })()
                ]);
            })().then(() => {
                this.fetching = null;
                this.start();
            }).catch(err => {
                this.fetching = null;
                logger.error(err);
                if (this.reset_on_error)
                    this.reset().catch(err => logger.error(err));
            });
        }
    }
    async fetch() {
        logger.profile('fetch()');
        await this.wxhack.reload();
        let message_list = await this.wxhack.get_message_list(),
            new_user_list = [];

        message_list = message_list.filter(msg => {
            let res = msg.time.match(/^(\d\d):(\d\d)$/);
            if (res)
                msg.time = new Date().setHours(parseInt(res[1]), parseInt(res[2]), 0, 0);
            return res;
        });

        for (let user of Object.keys(this.unknown_users)) {
            for (let message of this.unknown_users[user]) {
                let matched_message_list = message_list.filter(msg =>
                    new Date(message.CreateTime).setSeconds(0) == msg.time
                    && message.Content && message.Content.trim() == msg.content.trim()
                );
                if (matched_message_list.length == 1) {
                    new_user_list.push({
                        openid: user,
                        nickname: matched_message_list[0].remark_name,
                        avatar: matched_message_list[0].avatar,
                        message: matched_message_list[0].id
                    });
                    delete this.unknown_users[user];
                    break;
                }
            }
        }
        await Promise.all([
            ...new_user_list.map(user => (async () => {
                let save = path.join(this.media_dir, `${user.openid}.png`);
                await this.wxhack.download(user.avatar, fs.createWriteStream(save));
                await this.userdb.update_detailed(user.openid, {
                    nickname: user.nickname,
                    avatar: save
                });
            })())
        ]);
        logger.profile('fetch()');
    }
};
