const express = require('express');
const wechat = require('wechat');
const handlers = require('./handlers/index');


module.exports = function (options) {
    options = options || {};
    return express.Router()
        .use('/', wechat(options, (req, res, next) => next()))
        .use('/', handlers(options.handlers));
};
