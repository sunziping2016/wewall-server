const logger = require('winston').loggers.get('updatedb');
const userdb = require('../../database/userdb');

module.exports = function (options) {
    options = options || {};
    // Validating
    if (!options.userdb || !(options.userdb instanceof userdb))
        throw new Error('No userdb');
    return (req, res, next) => {
        (async () => {
            req.weixin.user = await options.userdb.new_messsage(req.weixin).catch(err => {
                logger.error(err);
            });
        })().catch(err => logger.error(err)).then(next);
    };
};
