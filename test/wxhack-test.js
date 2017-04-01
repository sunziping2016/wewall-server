const winston = require('winston').loggers.add('wxhack', {
    console: {
        level: 'info',
        colorize: true,
        label: 'wxhack'
    }
});

const wxhack = require('../wxmsg/wxhack');
const browser = new wxhack(require('../config/config.json').wxmsg.login);
const fs = require('fs');
const path = require('path');


let timeout= (ms) => new Promise(resolve => setTimeout(resolve, ms));

const out = path.join(__dirname, 'out');

(async () => {
    await browser.init();
    await browser.ensure_login();
    await browser.ensure_menu('消息管理');
    let messages = {}, users = {};
    while (true) {
        let message_list = await browser.get_message_list(),
            new_message_list = message_list.filter(msg => !(msg.id in messages)).reverse(),
            new_user_list = [];
        if (new_message_list.length)
            console.log('新消息:');
        for (let message of new_message_list) {
            console.log(`\t昵称: ${message.remark_name}\t时间: ${message.time}\t内容: ${message.content.trim()}`);
            if (!(message.remark_name in users)) {
                new_user_list.push(message);
                users[message.remark_name] = {};
            }
            messages[message.id] = message;
        }
        await Promise.all([
            ...new_user_list.map(msg => (async () => {
                let save = path.join(out, `${msg.remark_name}.png`);
                browser.download(msg.avatar, fs.createWriteStream(save));
                users[msg.remark_name].avatar = save;
            })()),
            (async () => {
                for (let msg of new_user_list) {
                    let rich_user_info = await browser.get_rich_user_info(msg.id),
                        save = path.join(out, `${msg.remark_name}-large.png`);
                    users[msg.remark_name].large_avatar = save;
                    await browser.download(rich_user_info.rich_avatar, fs.createWriteStream(save))
                }
            })()
        ]);

        if (new_user_list.length)
            console.log('新用户:');
        for (let message of new_user_list)
            console.log(`\t昵称: ${message.remark_name}\t头像: ${users[message.remark_name].avatar}\t大头像: ${users[message.remark_name].large_avatar}`);
        await browser.reload();
        await timeout(10000);
    }
})();
