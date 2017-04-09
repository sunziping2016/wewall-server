const logger = require('winston').loggers.get('userdb');
const fs = require('fs');

module.exports = class {
    constructor(event_router) {
        this.event_router = event_router;
    }
    async init(db) {
        await Promise.all([
            (async () => {
                this.users = await db.createCollection('users');
                await Promise.all([
                    this.users.createIndex({openid: 1}, {background: true}),
                    this.users.createIndex({last_time: 1}, {background: true})
                ]);
                this.check_detailed();
            })(),
            (async () => {
                this.msgs = await db.createCollection('messages');
                await Promise.all([
                    this.msgs.createIndex({MsgId: 1}, {background: true}),
                    this.msgs.createIndex({CreateTime: 1}, {background: true})
                ]);
            })(),
            (async () => {
                this.wall_msgs = await db.createCollection('wall_messages');
                await Promise.all([
                    this.wall_msgs.createIndex({msgid: 1}, {background: true}),
                    this.wall_msgs.createIndex({time: 1}, {background: true}),
                    this.wall_msgs.createIndex({state: 1}, {background: true})
                ]);
            })()
        ])
    }
    async new_message(msg) {
        logger.profile(`new_message(${msg.MsgId})`);
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
            if (!res.value.detailed)
                this.event_router.emit('new message from undetailed user', event);
            this.event_router.emit('users update', {users:[res.value]});
        }
        logger.profile(`new_message(${msg.MsgId})`);
    }
    async update_detailed(openid, data) {
        data.detailed = true;
        let res = await this.users.findOneAndUpdate({openid: openid}, {
            $set: data
        }, {
            projection: {_id: 0, messages: 0},
            returnOriginal: false
        });
        this.event_router.emit('users update', {users:[res.value]});
        logger.info(`New detailed user: ${openid}`);
    }
    async check_detailed() {
        await Promise.all((await Promise.all((await this.users.find({detailed:true},{avatar:1}).toArray())
            .map(x => new Promise((resove, reject) => fs.access(x.avatar, (err) => resove({_id: x._id, okay: !err}))))))
            .filter(x => !x.okay)
            .map(x => this.users.updateOne({_id:x._id}, {$set:{detailed:false},$unset:{avatar:0}}))
        );
    }
    async new_wall_message(msgid, openid, content, time) {
        logger.profile(`new_wall_message(${msgid})`);
        let res = await this.wall_msgs.updateOne({msgid: msgid}, {
            $setOnInsert: {
                openid: openid,
                content: content,
                time: time,
                state: 0
            },
        }, {upsert: true});
        if (res.upsertedCount) {
            this.event_router.emit('wall messages update', {messages: [{
                msgid: msgid, openid: openid, content: content, time: time, state: 0}]});
        }
        logger.profile(`new_wall_message(${msgid})`);
    }
    async update_messages_state(msgids, value) {
        let res = (await this.wall_msgs.find({msgid: {$in: msgids}, state: {$ne: value}}, {msgid: 1}).toArray()).map(x => x.msgid);
        if (!res.length) return;
        await this.wall_msgs.updateMany({msgid: {$in: res}}, {$set: {state: value}});
        this.event_router.emit('wall messages update', {messages:
            await this.wall_msgs.find({msgid: {$in: res}}, {_id: 0}).toArray()});
    }
    fetch_recent_messages(states, limit) {
        if (!states.length || limit == 0) return [];
        if (limit == -1) limit = 0;
        return this.wall_msgs.find(states.length == 3 ? {} : {state: {$in: states}},
            {_id:0}).sort({time: -1}).limit(limit).toArray();
    }
    fetch_recent_users(limit) {
        if (limit == 0) return [];
        if (limit == -1) limit = 0;
        return this.users.find({},{_id:0, messages:0}).sort({last_time:-1}).limit(limit).toArray();
    }
    find_users(openids) {
        if (!openids.length) return [];
        return this.users.find({openid: {$in: openids}},{_id:0, messages:0}).toArray();
    }
    query_users(filter, project, sort, limit) {
        return this.users.find(filter, project).sort(sort).limit(limit).toArray();
    }
    query_messages(filter, project, sort, limit) {
        return this.wall_msgs.find(filter, project).sort(sort).limit(limit).toArray();
    }
};
