const MongoClient = require('mongodb').MongoClient;
const userdb = require('../database/userdb');

(async () => {
    db = await MongoClient.connect(require('../config/config.json').dburl);
    const collection = new userdb(db);
    await collection.init();
})();