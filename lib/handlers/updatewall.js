const logger = require('winston').loggers.get('updatewall');

module.exports = class {
    constructor(userdb, options) {
        options = options || {};
        this.match = options.match || true;
        this.message = options.message || '';

        this.userdb = userdb;
        if (this.match === true)
            this.match = /^.*$/;
        else if (this.match === false)
            this.match = /$^/;
        this.label = 'update wall database';
        this.handler = (req, res, next) => {
            if (req.weixin.MsgType == 'text' && req.weixin.Content.match(this.match)) {
                this.userdb.new_wall_message(req.weixin.MsgId, req.weixin.FromUserName, req.weixin.Content, req.weixin.CreateTime).catch(err => logger.error(err));
                res.reply(this.message);
            } else
                next();
        };
    }
};
