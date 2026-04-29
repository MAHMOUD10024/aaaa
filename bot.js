const db = require('./db');
const { sendMessage } = require('./client');
require('dotenv').config();

const sessions = new Map();

const getAvailableSlots = (date) => {
  const booked = db.getAppointments(date).map(a => a.time);
  const slots = [];
  const startHour = parseInt(process.env.WORK_START);
  const endHour = parseInt(process.env.WORK_END);
  const duration = parseInt(process.env.SLOT_MINUTES);
  
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += duration) {
      const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      if (!booked.includes(time)) {
        slots.push(time);
      }
    }
  }
  return slots;
};

const formatButtons = (text, buttons) => {
  return text + '\n\n' + buttons.map((b, i) => `*${i + 1}.* ${b.label}`).join('\n');
};

const handleWebhook = async (from, text, rawMsg) => {
  // التحقق من الحجز المسبق
  const existing = db.getAppointmentByPhone(from);
  if (existing && text !== '1') {
    return sendMessage(from, `⛔ لديك ميعاد محجوز بالفعل:\n📅 ${existing.date} | ⏰ ${existing.time}\n\nللحجز برقم آخر، استخدم رقم هاتف مختلف.`, [
      { label: 'عرض ميعادي' }
    ]);
  }

  let session = sessions.get(from) || { step: 'start' };

  // القائمة الرئيسية
  if (session.step === 'start' || text === 'الرئيسية') {
    session = { step: 'menu' };
    sessions.set(from, session);
    return sendMessage(from, `🏥 *عيادتنا الطبية*\n\n💰 سعر الكشف: ${process.env.CLINIC_FEE} ج.م\n\nاختار الخدمة:`, [
      { label: '📅 حجز ميعاد' },
      { label: 'ℹ️ معلومات' },
      { label: '📞 تواصل' }
    ]);
  }

  // القائمة الرئيسية
  if (session.step === 'menu') {
    if (text === '1' || text.includes('حجز')) {
      session = { step: 'name' };
      sessions.set(from, session);
      return sendMessage(from, '✍️ *اكتب اسمك الثلاثي:*');
    } else if (text === '2' || text.includes('معلومات')) {
      return sendMessage(from, `📋 *معلومات العيادة:*\n\n🕐 مواعيد العمل: ${process.env.WORK_START}:00 - ${process.env.WORK_END}:00\n💰 الكشف: ${process.env.CLINIC_FEE} ج.م\n📍 ${process.env.CLINIC_ADDRESS}`, [
        { label: '🔙 الرئيسية' }
      ]);
    } else if (text === '3' || text.includes('تواصل')) {
      return sendMessage(from, `📞 *تواصل معنا:*\n\n📱 للطوارئ: ${process.env.DOCTOR_PHONE}\n⏰ من 9 ص - 5 م`, [
        { label: '🔙 الرئيسية' }
      ]);
    }
  }

  // جمع الاسم
  if (session.step === 'name') {
    session.name = text.trim();
    session.step = 'age';
    sessions.set(from, session);
    return sendMessage(from, '📅 *اكتب سنك:*');
  }

  // جمع السن
  if (session.step === 'age') {
    const age = parseInt(text);
    if (isNaN(age) || age < 1 || age > 120) {
      return sendMessage(from, '⚠️ *السن غير صحيح.*\nاكتب رقم صحيح (1-120):');
    }
    session.age = age;
    session.step = 'symptom';
    sessions.set(from, session);
    return sendMessage(from, '🩺 *اكتب الشكوى أو المرض:*');
  }

  // جمع الشكوى وعرض المواعيد
  if (session.step === 'symptom') {
    session.symptom = text.trim();
    session.step = 'select_date';
    sessions.set(from, session);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const slots = getAvailableSlots(dateStr);
    if (slots.length === 0) {
      sessions.delete(from);
      return sendMessage(from, '❌ *لا توجد مواعيد متاحة غداً.*\nجرب التواصل هاتفياً.', [
        { label: '🔙 الرئيسية' }
      ]);
    }

    let msg = `📅 *المواعيد المتاحة غداً (${dateStr}):*\n\n`;
    slots.slice(0, 10).forEach((t, i) => {
      msg += `${i + 1}. ⏰ ${t}\n`;
    });
    msg += `\n*اكتب رقم الميعاد:*`;
    
    session.availableSlots = slots;
    session.date = dateStr;
    sessions.set(from, session);
    return sendMessage(from, msg);
  }

  // اختيار الميعاد
  if (session.step === 'select_date') {
    const choice = parseInt(text) - 1;
    const { availableSlots, date } = session;
    
    if (isNaN(choice) || choice < 0 || choice >= availableSlots.length) {
      return sendMessage(from, '⚠️ *اكتب رقم الميعاد من القائمة:*');
    }

    const selectedTime = availableSlots[choice];
    
    // حفظ الحجز
    db.addAppointment({
      phone: from,
      name: session.name,
      age: session.age,
      symptom: session.symptom,
      date: date,
      time: selectedTime,
      status: 'confirmed'
    });

    sessions.delete(from);
    
    return sendMessage(from, 
      `✅ *تم الحجز بنجاح!*\n\n` +
      `👤 الاسم: ${session.name}\n` +
      `📅 التاريخ: ${date}\n` +
      `⏰ الساعة: ${selectedTime}\n` +
      `💰 الكشف: ${process.env.CLINIC_FEE} ج.م\n\n` +
      `📍 يرجى الحضور قبل الموعد بـ 10 دقائق.`,
      [
        { label: '🔙 الرئيسية' }
      ]
    );
  }

  // زر الرئيسية من أي مكان
  if (text === '🔙 الرئيسية' || text === 'الرئيسية') {
    sessions.delete(from);
    return handleWebhook(from, 'الرئيسية', rawMsg);
  }
};

module.exports = { handleWebhook };
