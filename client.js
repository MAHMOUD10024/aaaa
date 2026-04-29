const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const AUTH_FILE = path.join(__dirname, 'auth.json');
let sock = null;

const loadAuth = () => {
  if (fs.existsSync(AUTH_FILE)) {
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  }
  return undefined;
};

const saveAuth = (state) => {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(state));
};

const startClient = async (messageHandler) => {
  const auth = loadAuth();
  
  sock = makeWASocket({
    auth: auth ? { state: auth, saveCreds: () => {} } : undefined,
    printQRInTerminal: true,
    logger: { level: 'silent' },
    browser: ['Chrome', 'Chrome', '120.0'],
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', () => {
    if (sock.authState) saveAuth(sock.authState);
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('🔄 إعادة الاتصال...');
        setTimeout(() => startClient(messageHandler), 3000);
      }
    } else if (connection === 'open') {
      console.log('✅ البوت متصل وجاهز!');
    } else if (qr) {
      qrcode.generate(qr, { small: true });
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    const msg = m.messages[0];
    if (!msg.message) return;

    const text = msg.message.conversation || 
                 msg.message.extendedTextMessage?.text ||
                 msg.message.buttonsResponseMessage?.selectedButtonId ||
                 '';
    
    const sender = msg.key.remoteJid.split('@')[0];
    await messageHandler(sender, text, msg);
  });

  return sock;
};

const sendMessage = async (jid, text, buttons = []) => {
  if (!sock) return;
  const fullJid = `${jid}@s.whatsapp.net`;
  
  if (buttons.length > 0) {
    // إرسال مع أزرار (محاكاة)
    let btnText = text + '\n\n';
    buttons.forEach((b, i) => {
      btnText += `${i + 1}. ${b.text}\n`;
    });
    await sock.sendMessage(fullJid, { text: btnText });
  } else {
    await sock.sendMessage(fullJid, { text });
  }
};

module.exports = { startClient, sendMessage };
