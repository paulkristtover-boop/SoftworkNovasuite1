const express = require('express');
const router = express.Router();

// Placeholder for additional webhooks (payment providers etc.)
router.get('/', (req, res) => res.json({ ok: true }));

module.exports = router;
