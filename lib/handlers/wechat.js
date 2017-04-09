const wechat = require('wechat');


module.exports = class {
    constructor(options) {
        this.options = options || {};
        this.label = 'wechat';
        this.handler = wechat(options, (req, res, next) => {
            if (req.weixin.CreateTime)
                req.weixin.CreateTime = new Date(parseInt(req.weixin.CreateTime) * 1000);
            next()
        });
    }
};
