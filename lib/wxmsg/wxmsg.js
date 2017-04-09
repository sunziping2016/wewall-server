const express = require('express');
const wechat = require('wechat');
const connectr = require('../connectr');

module.exports = class {
    constructor(options) {
        options = options || {};
        this.handlers = options.handlers;

        this.router = express.Router();
        this.middlewares = new connectr(this.router);
        for (let middleware of this.handlers) {
            this.middlewares.use(middleware.route || '/', middleware.handler);
            if (middleware.label)
                this.middlewares.as(middleware.label);
        }
    }
    get_order() {
        return this.middlewares.get_order();
    }
    get_available() {
        return this.middlewares.get_available();
    }
    set_order(order) {
        return this.middlewares.set_order(order);
    }
};
