/**
 * @brief   Mongodb database storing user information.
 *
 */

const { MongoClient } = require('mongodb');

module.exports = class {
    constructor(url, store_dir) {
        this.url = url;
        this.store_dir = store_dir;
        this.wx = new wxhack()
    }
    async init() {
        this.db = await MongoClient.connect(this.url);
        this.user = await this.db.createCollection('user', {
            validator: {
                $and: [
                    {_id: {$type: 'string'}},
                    {detailed: {$type: 'bool'}},
                    {nickname: {$type: 'string'}},
                    {avatar: {$type: 'string'}},
                    {large_avatar: {$type: 'string'}},
                ]
            }
        });
    }
    async process(info) {
    }
};