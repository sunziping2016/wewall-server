const logger = require('winston').loggers.get('updateuser');

module.exports = class {
    constructor(userdb) {
        this.userdb = userdb;

        this.label = 'update user database';
        this.handler = (req, res, next) => {
            this.userdb.new_message(req.weixin).catch(err => logger.error(err));
            next();
        };
    }
};
