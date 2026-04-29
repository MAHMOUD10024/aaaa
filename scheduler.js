const cron = require('node-cron');
const db = require('./db');
const { sendMessage } = require('./client');
const moment = require('moment-timezone');
moment.tz.setDefault(process.env.TIMEZONE);

// ⏰ تنبيه قبل 15 دقيقة
cron.schedule('*/1 * * * *', async () => {
    const now = moment();
    const today = now.format('YYYY-MM-DD');
    const reminderWindow = now.add(15, 'minutes').format('HH:mm');

    const appointments = db.prepare(`
    SELECT * FROM appointments 
    WHERE date = ? AND time <= ? AND status = 'confirmed' AND reminder_sent = 0
  `).all(today, reminderWindow);

    for (const appt of appointments) {
        await sendMessage(appt.phone, `⏳ تذكير: موعدك بعد 15 دقيقة (الساعة ${appt.time}).\n📍 العنوان: ${process.env.CLINIC_ADDRESS}`);
        db.prepare('UPDATE appointments SET reminder_sent = 1 WHERE id = ?').run(appt.id);
    }
});

// 📅 جدول الغد للدكتور
cron.schedule('0 20 * * *', async () => {
    const tomorrow = moment().add(1, 'day').format('YYYY-MM-DD');
    const list = db.prepare('SELECT name, time FROM appointments WHERE date = ? ORDER BY time ASC').all(tomorrow);

    let msg = `📊 جدول مواعيد غداً (${tomorrow}):\n`;
    if (list.length === 0) msg += 'لا توجد حجوزات.\n';
    else list.forEach((a, i) => msg += `${i + 1}. ${a.name} - ${a.time}\n`);

    await sendMessage(process.env.DOCTOR_PHONE, msg);
});