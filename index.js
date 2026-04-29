require('dotenv').config();
const { startClient } = require('./client');
const { handleWebhook } = require('./bot');
require('./scheduler');

console.log('🚀 بدء تشغيل البوت...');

startClient(handleWebhook).catch(err => {
  console.error('❌ خطأ في التشغيل:', err.message);
  process.exit(1);
});
