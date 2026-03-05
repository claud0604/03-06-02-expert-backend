const express = require('express');
const router = express.Router();
const AppSettings = require('../models/AppSettings');

// GET /api/app-settings/:type
router.get('/:type', async (req, res) => {
  try {
    const doc = await AppSettings.findOne({ type: req.params.type });
    if (!doc) {
      return res.json({ success: true, data: null });
    }
    res.json({ success: true, data: doc });
  } catch (err) {
    console.error('AppSettings GET error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/app-settings/:type
router.put('/:type', async (req, res) => {
  try {
    const doc = await AppSettings.findOneAndUpdate(
      { type: req.params.type },
      { type: req.params.type, data: req.body.data, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: doc });
  } catch (err) {
    console.error('AppSettings PUT error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
