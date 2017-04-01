const EventEmitter = require('events');
const express = require('express');
const wechat = require('wechat');
const wxhack = require('./wxhack');

module.exports = class extends EventEmitter {
    constructor(options) {
        options = options && {};
        this.wxhack = new wxhack(options.account);
        this.router = express.Router();
        this.router.use('/', wechat(options.app, (req, res, next) => {
            let info = req.weixin;
            console.log(info);
            res.reply('hello, world!');
        }));
    }
    async init(db) {
        await Promise.all([
            this.wxhack.init(),
            (async () => {
                this.collection = await db.createCollection('user', {
                    validator: {
                        $and: [
                            {openid: {$type: 'string'}},
                            {detailed: {$type: 'bool'}},
                            {nickname: {$type: 'string'}},
                            {avatar: {$type: 'string'}},
                            {large_avatar: {$type: 'string'}},
                        ]
                    }
                });
                await this.collection.createIndex({openid: 'hashed'}, {background: true});
            })(),
        ]);
    }
    async exit() {
    }
};