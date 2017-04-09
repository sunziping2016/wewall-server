const bcrypt = require('bcrypt');
const logger = require('winston').loggers.get('userdb');

module.exports = class {
    constructor(event_router, options) {
        this.event_router = event_router;
        this.default_users = options.default_users || {};
        this.salt_rounds = options.salt_rounds || 10;

        this.password_hashed = false;
    }
    async init(db) {
        this.auth = await db.createCollection('authentication');
        if (!this.password_hashed) {
            await Promise.all(Object.keys(this.default_users)
                .filter(name => this.default_users[name].password)
                .map(name => (async () => {
                    this.default_users[name].password = await bcrypt.hash(this.default_users[name].password, this.salt_rounds);
                })())
            );
            this.password_hashed = true;
        }
        await Promise.all([
            this.auth.createIndex({username: 1}, {background: true}),
            this.auth.createIndex({push: 1}, {background: true}),
            this.auth.createIndex({permissions: 1}, {background: true}),
            ...Object.keys(this.default_users).map(name => {
                let user = this.default_users[name];
                user.nickname = user.nickname || '';
                user.push = user.push || [];
                user.permissions = user.permissions || [];
                return this.auth.updateOne({username: name},
                    {$setOnInsert: this.default_users[name]}, {upsert: true})
            })
        ]);
    }
    async authorize(username, password) {
        let res = await this.auth.findOne({username: username}, {_id: 0, username: 0});
        if (res == null || ((!res.password && password != '') || (res.password && !await bcrypt.compare(password, res.password))))
            return {error: 'Wrong username or password'};
        return {
            nickname: res.nickname,
            push: res.push,
            permissions: res.permissions
        };
    }
};
