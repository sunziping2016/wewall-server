const updatedb = require('./updatedb');
const default_ = require('./default');

module.exports = function (options) {
    options = options || {};
    return [
        updatedb(options.updatedb),
        default_
    ];
};
