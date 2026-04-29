const fs = require('fs');
const path = require('path');
const DB_FILE = path.join(__dirname, 'data.json');

let data = { appointments: [] };

if (fs.existsSync(DB_FILE)) {
  try {
    data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    data = { appointments: [] };
  }
}

const save = () => {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

module.exports = {
  addAppointment: (apt) => {
    data.appointments.push({ ...apt, id: Date.now(), reminderSent: false });
    save();
  },
  
  getAppointments: (date) => {
    return data.appointments.filter(a => a.date === date && a.status === 'confirmed');
  },
  
  getAppointmentByPhone: (phone) => {
    return data.appointments.find(a => a.phone === phone && a.status === 'confirmed');
  },
  
  markReminderSent: (id) => {
    const apt = data.appointments.find(a => a.id === id);
    if (apt) {
      apt.reminderSent = true;
      save();
    }
  },
  
  getAllAppointments: () => data.appointments
};
