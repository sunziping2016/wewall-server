const wechat = require('wechat');
const express = require('express');
const morgan = require('morgan');
const config = require('./config/config.json');

const app = express();

app.use(morgan('tiny'));
app.use(express.query());
app.use('/', wechat(config.wechat, function (req, res, next) {
    let info = req.weixin;
    console.log(info);
    res.reply('hello, world!');
}));

app.listen(15838);
