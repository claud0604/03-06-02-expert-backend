const mongoose = require('mongoose');

const appSettingsSchema = new mongoose.Schema({
  type: { type: String, required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AppSettings', appSettingsSchema, '06-app-settings');
