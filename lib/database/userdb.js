const logger = require('winston').loggers.get('userdb');

module.exports = class {
    constructor(event_router) {
        this.event_router = event_router;
    }
    async init(db) {
        await Promise.all([
            (async () => {
                this.users = await db.createCollection('users');
                await Promise.all([
                    this.users.createIndex({openid: 'hashed'}, {background: true}),
                    this.users.createIndex({last_time: -1}, {background: true}),
                ]);

            })(),
            (async () => {
                this.msgs = await db.createCollection('messages');
                await Promise.all([
                    this.msgs.createIndex({MsgId: 'hashed'}, {background: true}),
                    this.msgs.createIndex({CreateTime: -1}, {background: true}),
                ]);
            })()
        ])
    }
    async new_messsage(msg) {
        logger.profile(`new_messsage(${msg.MsgId})`);
        if (msg.CreateTime)
            msg.CreateTime = new Date(parseInt(msg.CreateTime) * 1000);
        let res = await this.msgs.updateOne({MsgId: msg.MsgId}, {$set: msg}, {upsert: true});
        if (res.upsertedCount) {
            res = await this.users.findOneAndUpdate({openid: msg.FromUserName}, {
                $setOnInsert: {detailed: false},
                $set: {last_time: msg.CreateTime},
                $push: {messages: res.upsertedId._id}
            }, {
                projection: {messages: 0},
                upsert: true,
                returnOriginal: false
            });
            const event = {
                user:res.value,
                message: msg
            };
            if (!res.lastErrorObject.updatedExisting) {
                this.event_router.emit('new user', event);
                logger.info(`New user: ${event.user.openid}`);
            }
            if (!res.value.detailed) {
                this.event_router.emit('new message from undetailed user', event);
                logger.info(`New message from undetailed user: ${event.user.openid} ${event.message.MsgId}`);
            }
            this.event_router.emit('new message', event);
            logger.info(`New message: ${event.message.MsgId}`);
            return event;
        }
        logger.profile(`new_messsage(${msg.MsgId})`);
    }
    async update_detailed(openid, data) {
        data.detailed = true;
        await this.users.findOneAndUpdate({openid: openid}, {
            $set: data
        }, {
            projection: {messages: 0},
            returnOriginal: false
        });
        this.event_router.emit('new detailed user', data);
        logger.info(`New detailed user: ${openid}`);
    }
};
