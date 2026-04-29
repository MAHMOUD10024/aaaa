const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');
require('dotenv').config();

let sock = null;

const startClient = async (messageHandler) => {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const phoneNumber = process.env.PHONE_NUMBER?.replace(/\D/g, '');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: !phoneNumber,
    logger: require('pino')({ level: 'silent' }),
    browser: ['Windows', 'Chrome', '120.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startClient(messageHandler);
    }
    else if (connection === 'open') {
      console.log('✅ تم ربط الرقم بنجاح! البوت يعمل الآن.');
    }
    else if (qr) {
      if (phoneNumber) {
        // طلب الكود المؤقت تلقائياً لو الرقم موجود في .env
        try {
          const code = await sock.requestPairingCode(phoneNumber);
          console.log(`\n🔑 الكود المؤقت (Pairing Code) هو: ${code}`);
          console.log(' اذهب إلى واتساب هاتفك > الإعدادات > الأجهزة المرتبطة > ربط جهاز > أدخل الكود أعلاه\n');
        } catch (err) {
          console.error('❌ فشل في طلب الكود المؤقت:', err.message);
        }
      } else {
        console.log('📱 امسح الـ QR Code التالي:');
        qrcode.generate(qr, { small: true });
      }
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    const msg = m.messages[0];
    if (!msg.message) return;

    let text = msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
      '';

    const sender = msg.key.remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
    await messageHandler(sender, text, msg);
  });

  return sock;
};

const sendMessage = async (jid, text) => {
  if (!sock) return console.warn('⚠️ البوت غير متصل.');
  const fullJid = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
  await sock.sendMessage(fullJid, { text });
};

module.exports = { startClient, sendMessage };