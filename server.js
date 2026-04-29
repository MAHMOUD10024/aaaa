require('dotenv').config();
const { startClient } = require('./client');
const { handleWebhook } = require('./bot');
require('./scheduler'); // تشغيل المهام الدورية

startClient(handleWebhook).catch(err => {
    console.error('❌ فشل في تشغيل البوت:', err);
    process.exit(1);
});