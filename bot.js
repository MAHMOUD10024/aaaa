const db = require('./db');
const { sendMessage } = require('./client');
const moment = require('moment-timezone');
moment.tz.setDefault(process.env.TIMEZONE);

const sessions = new Map();

const handleWebhook = async (from, text, rawMsg) => {
    // منع الحجز المتكرر (رقم واحد = ميعاد واحد فقط)
    const existing = db.prepare('SELECT id FROM appointments WHERE phone = ? AND status = ?').get(from, 'confirmed');
    if (existing) return sendMessage(from, `⛔ الرقم ده مسجل له ميعاد بالفعل. لا يمكن الحجز مرة أخرى.`);

    let session = sessions.get(from) || { step: 'start' };
    if (!text || text.trim() === '') return;

    if (session.step === 'start') {
        session.step = 'name';
        sessions.set(from, session);
        return sendMessage(from, `👋 أهلاً بك في عيادتنا.\n💰 سعر الكشف: ${process.env.CLINIC_FEE} ج.م.\n\n✍️ اكتب اسمك الثلاثي للبدء:`);
    }

    if (session.step === 'name') {
        session.name = text.trim();
        session.step = 'age';
        sessions.set(from, session);
        return sendMessage(from, `📅 السن:`);
    }

    if (session.step === 'age') {
        const age = parseInt(text.trim());
        if (isNaN(age) || age < 1) return sendMessage(from, `⚠️ من فضلك اكتب السن كأرقام صحيحة.`);
        session.age = age;
        session.step = 'symptom';
        sessions.set(from, session);
        return sendMessage(from, `🩺 الشكوى أو المرض:`);
    }

    if (session.step === 'symptom') {
        session.symptom = text.trim();
        session.step = 'waiting_slots';
        sessions.set(from, session);

        const tomorrow = moment().add(1, 'day').format('YYYY-MM-DD');
        const start = moment(`${tomorrow} ${process.env.WORK_START}`, 'YYYY-MM-DD HH:mm');
        const end = moment(`${tomorrow} ${process.env.WORK_END}`, 'YYYY-MM-DD HH:mm');
        const duration = parseInt(process.env.SLOT_MINUTES);

        let slots = [];
        let current = start.clone();
        while (current.isBefore(end)) {
            slots.push(current.format('HH:mm'));
            current.add(duration, 'minutes');
        }

        const booked = db.prepare('SELECT time FROM appointments WHERE date = ? AND status = ?').all(tomorrow, 'confirmed');
        const bookedTimes = booked.map(b => b.time);
        const available = slots.filter(s => !bookedTimes.includes(s));

        if (available.length === 0) {
            sessions.delete(from);
            return sendMessage(from, `❌ لا توجد مواعيد متاحة غداً.`);
        }

        let msg = `📅 المواعيد المتاحة غداً (${tomorrow}):\n`;
        available.forEach((t, i) => msg += `${i + 1}. ${t}\n`);
        msg += `\n✍️ اكتب رقم الميعاد المناسب لك (مثال: 1 أو 3):`;
        sessions.set(from, { ...session, available });
        return sendMessage(from, msg);
    }

    if (session.step === 'waiting_slots') {
        const choice = parseInt(text.trim());
        const { available } = session;
        if (!available || isNaN(choice) || choice < 1 || choice > available.length) {
            return sendMessage(from, `⚠️ اكتب رقم الميعاد من القائمة السابقة فقط.`);
        }

        const selectedTime = available[choice - 1];
        const date = moment().add(1, 'day').format('YYYY-MM-DD');

        db.prepare(`INSERT INTO appointments (phone, name, age, symptom, date, time, status) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
            from, session.name, session.age, session.symptom, date, selectedTime, 'confirmed'
        );

        sessions.delete(from);
        return sendMessage(from, `✅ تم الحجز بنجاح!\n👤 الاسم: ${session.name}\n📅 التاريخ: ${date}\n⏰ الساعة: ${selectedTime}\n💰 الكشف: ${process.env.CLINIC_FEE} ج.م\n\n📍 يرجى الحضور قبل الموعد بـ 10 دقائق.`);
    }
};

module.exports = { handleWebhook };