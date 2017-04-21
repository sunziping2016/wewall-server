const logger = require('winston').loggers.get('socket');
const path = require('path');
const url = require('url');
const socket_io = require('socket.io');

const message_states = ['raw', 'accepted', 'rejected'];
const user_state = ['raw', 'detailed'];

const available_permissions = [
    "message accept", "message reject", "message send",
    "query message", "query user"
];

module.exports = class {
    constructor(userdb, authdb, event_router, http_server, options) {
        options = options || {};
        this.ping_timeout = options.ping_timeout || 20000;
        this.ping_interval = options.ping_interval || 10000;
        this.images_path = options.images_path || '/';

        this.userdb = userdb;
        this.authdb = authdb;
        this.event_router = event_router;
        this.io = socket_io(http_server, {
            pingTimeout: this.ping_timeout,
            pingInterval: this.ping_interval
        });

        this.io.on('connect', socket => this.socket_handle_connect(socket));

        this.event_router.on('wall messages update', data => this.handle_database_messages(data));
        this.event_router.on('users update', data => this.database_handle_users(data));
    }
    user_transform(user) {
        if (user && user.avatar)
            user.avatar = url.join(this.images_path, path.basename(user.avatar));
        return user;
    }
    handle_database_messages(data) {
        logger.profile('handle_database_messages()');
        let messages = [[], [], []], users = data.users || {};
        data.messages.forEach(msg => messages[msg.state].push(msg));
        Promise.all(messages.map((msgs, state) => (async () => {
            if (!msgs.length) return;
            this.io.to(`message ${message_states[state]}`).emit('messages', {
                messages: msgs
            });
            const room_name = `message ${message_states[state]} with user`;
            if (this.io.sockets.adapter.rooms[room_name]) {
                let users = {}, needed_users = {};
                msgs.forEach(msg => users[msg.openid] ?
                    users[msg.openid] = this.user_transform(users[msg.openid]) :
                    needed_users[msg.openid] = true);
                (await this.userdb.find_users(Object.keys(needed_users)))
                    .forEach(user => users[user.openid] = this.user_transform(user));
                this.io.to(room_name).emit('messages', {
                    messages: msgs,
                    users: users,
                });
            }
        })())).catch(err => logger.error(err))
            .then(() => logger.profile('handle_database_messages()'));
    }
    database_handle_users(data) {
        logger.profile('database_handle_users()');
        let users = [[], []];
        data.users.forEach(user => users[+user.detailed].push(this.user_transform(user)));
        users.forEach((d, state) => {
            if (!d.length) return;
            this.io.to(`user ${user_state[state]}`).emit('users', {users: d});
        });
        logger.profile('database_handle_users()');
    }
    socket_handle_connect(socket) {
        logger.info(`Connect: ${socket.id}`);
        this.update_permissions(socket, [], []);
        socket.on('disconnect', reason => {
            logger.info(`Disconnect: ${socket.id}`);
            this.io.to('connection').emit('connection', this.get_connection_data());
        });
        socket.on('error', err => logger.error(err));
        socket.on('authorize', data => this.handle_authorize(socket, data));
        this.io.to('connection').emit('connection', this.get_connection_data());
    }
    get_connection_data() {
        let clients = this.io.sockets.connected;
        return Object.keys(clients).map(x=> {
            let socket = clients[x];
            return {
                id: socket.id,
                address: socket.handshake.headers['x-real-ip'] || socket.handshake.address,
                time: socket.handshake.time,
                username: socket.username || '',
                nickname: socket.nickname || ''
            }

        });
    }
    handle_message_accept(socket, data) {
        logger.profile('handle_message_accept()');
        this.userdb.update_messages_state(data, 1)
            .catch(err => logger.error(err))
            .then(() => logger.profile('handle_message_accept()'));
    }
    handle_message_reject(socket, data) {
        logger.profile('handle_message_reject()');
        this.userdb.update_messages_state(data, 2)
            .catch(err => logger.error(err))
            .then(() => logger.profile('handle_message_reject()'));
    }
    update_permissions(socket, push, permissions) {
        Object.keys(socket.rooms).forEach(room => {
            if (room != socket.id)
                socket.leave(room);
        });
        available_permissions.forEach(x => socket.removeAllListeners(x));
        socket.push = {};
        push.forEach(x => {
            socket.push[x] = true;
            socket.join(x);
        });
        socket.permissions = {};
        permissions.forEach(x => {
            socket.permissions[x] = true;
            socket.on(x, data => {
                if (this['handle_' + x.replace(' ', '_')])
                    this['handle_' + x.replace(' ', '_')](socket, data)
            });
        });
    }
    handle_authorize(socket, data) {
        logger.profile(`handle_authorize('${data.username}')`);
        (async() => {
            let d = await this.authdb.authorize(data.username || '', data.password || '');
            if (d.error) {
                socket.emit('authorized', d);
            } else {
                this.update_permissions(socket, d.push, d.permissions);
                socket.nickname = d.nickname;
                socket.username = d.username;
                socket.emit('authorized', {
                    nickname: d.nickname,
                    push: d.push,
                    permissions: d.permissions
                });
                this.io.to('connection').emit('connection', this.get_connection_data());
            }
        })().catch(err => logger.error(err)).then(()=>logger.profile(`handle_authorize('${data.username}')`));
    }
    handle_query_user(socket, data) {
        logger.profile('handle_query_user()');
        this.userdb.query_users(data.filter || {}, data.project || {}, data.sort || {}, data.limit || 0)
            .then(res => {
                res.forEach(u => this.user_transform(u));
                socket.emit('query user', {queryid: data.queryid, result: res});
            })
            .catch(err => logger.error(err))
            .then(()=>logger.profile('handle_query_user()'));
    }
    handle_query_message(socket, data) {
        logger.profile('handle_query_message()');
        this.userdb.query_messages(data.filter || {}, data.project || {}, data.sort || {}, data.limit || 0)
            .then(res => socket.emit('query message', {queryid: data.queryid, result: res}))
            .catch(err => logger.error(err))
            .then(()=>logger.profile('handle_query_message()'));
    }
    handle_connection_kick(socket, data) {
        let s = this.io.sockets.connected[data.id];
        if (s) s.close();
    }
};
