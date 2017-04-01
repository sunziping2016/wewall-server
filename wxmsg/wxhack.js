const phantom = require('phantom');
const Cookie = require('tough-cookie').Cookie;
const request = require('request');
const path = require('path');
const spawn = require('child_process').spawn;
const logger = require('winston').loggers.get('wxhack');
const readline = require('readline');
const process = require('process');
const fs = require('fs');
const os = require('os');
const url = require('url');
const EventEmitter = require('events');

let timeout= (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = class {
    constructor(options) {
        options = options || {};
        this.username = options.username;
        this.password = options.password;
        this.user_agent = options.user_agent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2987.110 Safari/537.36';
        this.polling_interval = options.polling_interval || 50;

        this.client = new EventEmitter();

        this.require_verify = options.require_verify || (path => new Promise((resolve, reject) => {
            spawn('xdg-open', [path]);
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            rl.question('Please input the QR code: ', answer => {
                resolve(answer.trim());
                rl.close();
            });
        }));
        this.require_qr = options.require_qr || (path => {
                spawn('xdg-open', [path]);
        });
    }
    async init() {
        logger.profile('init()');
        this.instance = await phantom.create(['--ignore-ssl-errors=yes'/*, '--load-images=false'*/]);
        this.page = await this.instance.createPage();
        await Promise.all([
            this.page.property('userAgent', this.user_agent),
            this.page.on('onCallback', data => {
                this.client.emit(data.event, data.data);
                logger.verbose(`Client event: ${data.event}`);
            }),
            this.page.on('onError', (msg) => {
                logger.warn(`Console error: ${msg}`);
            }),
            this.page.on('onResourceRequested', data => {
                logger.verbose(`Requesting ${data.url}`);
            }),
            this.page.on('onResourceError', error => {
                logger.warn(`Request error: ${error.errorString} ${error.url}\t`);
            }),
            this.page.on('onResourceTimeout', data => {
                logger.warn(`Request timeout: ${data.url}`);
            }),
            this.page.on('onConsoleMessage', msg => {
                logger.verbose(`Console: ${msg}`);
            })
        ]);
        logger.profile('init()');
    }
    async exit() {
        await this.instance.exit();
    }
    async ensure_login() {
        logger.profile('ensure_login()');
        if (!await this.page.evaluate(function () {
            return !!document.getElementById('logout');
        })) {
            await this.page.open('https://mp.weixin.qq.com/');
            await this.page.evaluate(function (username, password) {
                document.getElementById('username').value = username;
                document.getElementById('pwd').value = password;
                document.getElementById('loginBt').click();
            }, this.username, this.password);
            let verify_img = null, qr_code = null, error_tips = null, old_error_tips = null;
            while (true) {
                [verify_img, qr_code, error_tips] = await this.page.evaluate(function() {
                    var verify = document.getElementById('verifyImg'),
                        qr = document.getElementsByClassName('qrcode')[0],
                        err = document.getElementsByClassName('err_tips')[0],
                        code = document.getElementById('verify');
                    return code && code.value ? [null, null, null] : [
                        verify && verify.src != 'https://mp.weixin.qq.com/' ? verify.src : null,
                        qr && qr.src.search('/loginqrcode') != -1 ? qr.src : null,
                        err && err.innerText ? err.innerText : null
                    ];
                });
                if (error_tips && error_tips != old_error_tips)
                    logger.error(error_tips);
                old_error_tips = error_tips;
                if (qr_code)
                    break;
                else if (verify_img) {
                    let verify_saved = path.join(os.tmpdir(), 'verify_img.png');
                    await this.download_image(verify_img, fs.createWriteStream(verify_saved));
                    logger.info('Require captcha to login');
                    let verify_code = await this.require_verify(verify_saved);
                    await this.page.evaluate(function (code) {
                        document.getElementById('verify').value = code;
                        document.getElementById('loginBt').click();
                    }, verify_code);
                    old_error_tips = null;
                }
                await timeout(this.polling_interval);
            }
            let qrcode_saved = path.join(os.tmpdir(), 'qr_code.png');
            await this.download_image(qr_code, fs.createWriteStream(qrcode_saved));
            logger.info('Require QR code to login');
            this.require_qr(qrcode_saved);
            while (!await this.page.evaluate(function () {
                return !!document.getElementById('logout');
            }))
                await timeout(this.polling_interval);
        }
        logger.profile('ensure_login()');
    }
    async ensure_menu(menu_item, reload) {
        logger.profile(`ensure_menu(menu_item='${menu_item}', reload=${reload})`);
        let heading = null;
        if (!(heading = await this.page.evaluate(function () {
                var heading = document.getElementsByTagName('h2')[0];
                return heading && heading.innerText;
            })) || heading.search(menu_item) == -1) {
            await this.page.evaluate(function (item) {
                Array.prototype.filter.call(document.getElementsByClassName('menu_item'), function (x) {
                    return x.innerText.search(item) != -1;
                })[0].firstChild.click();
            }, menu_item);
            while (!(heading = await this.page.evaluate(function () {
                var heading = document.getElementsByTagName('h2')[0];
                return heading && heading.innerText;
            })) || heading.search(menu_item) == -1)
                await timeout(this.polling_interval);
        } else if (reload) {
            await this.page.reload();
        }
        logger.profile(`ensure_menu(menu_item='${menu_item}', reload=${reload})`);
    }
    async reload() {
        logger.profile('reload()');
        await this.page.reload();
        logger.profile('reload()');
    }
    async download(download_url, stream) {
        logger.profile(`download(download_url='${download_url}')`);
        let orig_url = await this.page.property('url');
        download_url = url.resolve(orig_url, download_url);
        let cookies = await this.page.property('cookies');
        let jar = request.jar();
        for (let cookie of cookies) {
            if (cookie.name !== undefined) {
                cookie.key = cookie.name;
                delete cookie.name;
            }
            if (cookie.httponly !== undefined) {
                cookie.httpOnly = cookie.httponly;
                delete cookie.httponly;
            }
            if (cookie.expires !== undefined)
                cookie.expires = new Date(cookie.expires);
            jar.setCookie(new Cookie(cookie), download_url, {ignoreError: true});
        }
        let req = request({
            url: download_url,
            jar: jar,
            headers: {
                'User-Agent': this.user_agent,
                'Referer': orig_url
            }
        });
        await new Promise((resolve, reject) => {
            req.pipe(stream)
                .on('close', resolve)
                .on('error', reject);
        });
        // Due to this issue https://github.com/ariya/phantomjs/issues/13409, we cannot set cookies back
        // to browser. It is said to be redesigned, but till now (Mar 31 2017), no change has been made.
        /*await Promise.all([
            new Promise((resolve, reject) => {
                req.on('response', () => {
                    jar._jar.store.getAllCookies((err, cookies) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        cookies = cookies.map(x => x.toJSON());
                        for (let cookie of cookies) {
                            if (cookie.key !== undefined) {
                                cookie.name = cookie.key;
                                delete cookie.key;
                            }
                            if (cookie.httpOnly !== undefined) {
                                cookie.httponly = cookie.httpOnly;
                                delete cookie.httpOnly;
                            }
                            if (cookie.expires instanceof Date) {
                                cookie.expires = cookie.expires.toGMTString();
                                cookie.expiry = cookie.expires.toTime();
                            }
                            else if (cookie.expires == Infinity)
                                delete cookie.expires;
                            delete cookie.lastAccessed;
                            delete cookie.creation;
                            delete cookie.hostOnly;
                        }
                        this.page.property('cookies', cookies).then(resolve).catch(reject);
                    });
                }).on('error', reject);
            }),
            new Promise((resolve, reject) => {
                req.pipe(fs.createWriteStream(save_path))
                    .on('close', resolve)
                    .on('error', reject);
            })
        ]);*/
        logger.profile(`download(download_url='${download_url}')`);
    }
    async download_image(download_url, stream) {
        logger.profile(`download_image(download_url='${download_url}')`);
        await Promise.all([
            new Promise((resolve, reject) => {
                this.client.once('donwload image', data => {
                    if (data.err)
                        reject(err);
                    else
                        stream.write(Buffer.from(data.data, 'base64'), resolve);

                });
            }),
            this.page.evaluate(function (url) {
                var img = new Image(), callback = function (err, data) {
                    callPhantom({
                        event: 'donwload image',
                        data: {
                            err: err && err.message,
                            data: data
                        }
                    });
                };
                img.onload = function () {
                    var canvas = document.createElement("canvas");
                    canvas.width = img.width;
                    canvas.height = img.height;
                    canvas.getContext("2d").drawImage(img, 0, 0);
                    callback(null, canvas.toDataURL("image/png").replace(/^data:image\/(png|jpg);base64,/, ""));
                };
                img.onerror = function () {
                    callback(new Error('Failed to fetch image.'));
                };
                img.src = url;
            }, download_url)
        ]);
        logger.profile(`download_image(download_url='${download_url}')`);
    }
    async get_message_list() {
        logger.profile('get_message_list()');
        let message_list = [];
        // ASSUME THERE EXIST AT LEAST SOME MESSAGES
        while (!message_list || !message_list.length || message_list.some(x => !x.avatar)) {
            message_list = await this.page.evaluate(function () {
                return Array.prototype.slice.call(document.getElementsByClassName('message_item')).map(function (x) {
                    var time = x.getElementsByClassName('message_time')[0],
                        content = x.getElementsByClassName('message_content')[0],
                        remark_name = x.getElementsByClassName('remark_name')[0],
                        avatar = x.getElementsByClassName('avatar')[0],
                        avatar_img = avatar && avatar.getElementsByTagName('img')[0];
                    return {
                        id: x.id,
                        time: time && time.innerText,
                        content: content && content.innerText,
                        remark_name: remark_name && remark_name.innerText,
                        avatar: avatar_img && (avatar_img.src.search('icon80_avatar_default.png') == -1 ? avatar_img.src : undefined)
                    };
                });
            });
            await timeout(this.polling_interval);
        }
        logger.profile('get_message_list()');
        return message_list;
    }
    async get_rich_user_info(msg_id) {
        logger.profile(`get_rich_user_info(msg_id='${msg_id}')`);
        let {remark_name, okay} = await this.page.evaluate(function (id) {
            var msg = document.getElementById(id),
                remark_name = msg && msg.getElementsByClassName('remark_name')[0],
                avatar = msg && msg.getElementsByClassName('avatar')[0],
                event = document.createEvent('MouseEvents');
            event.initMouseEvent('mouseover');
            if (avatar) avatar.dispatchEvent(event);
            return {
                remark_name: remark_name && remark_name.innerText,
                okay: !!avatar
            };
        }, msg_id);
        if (!remark_name || !okay)
            throw new Error('Cannot find the appointed message.');
        remark_name = remark_name.trim();
        let user_info = null;
        while (!(user_info = await this.page.evaluate(function () {
            var buddy = document.getElementsByClassName('rich_buddy')[0];
            if (!buddy || buddy.style.display == 'none')
                return null;
            var rich_avatar = buddy.getElementsByClassName('rich_user_avatar')[0],
                name = buddy.getElementsByClassName('gap_top_item')[0];
            return {
                rich_avatar: rich_avatar && rich_avatar.src,
                name: name && name.innerText
            }
        })) || !user_info.name || user_info.name.trim() != remark_name)
            await timeout(this.polling_interval);
        logger.profile(`get_rich_user_info(msg_id='${msg_id}')`);
        return user_info;
    }
};
