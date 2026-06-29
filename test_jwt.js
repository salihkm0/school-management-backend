const jwt = require('jsonwebtoken');
require('dotenv').config();

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5ZTQ3OTA1ZWM4Mjk5MjkzMWFhNzNmYiIsInJvbGUiOiJzdGFmZiIsImVtYWlsIjoidGVhY2hlcjFAc2Nob29sLmNvbSIsInBob25lIjoiOTg3NjU0MzIxMCIsImlhdCI6MTc4MjQ2NDMzOCwiZXhwIjoxNzgzMDY5MTM4fQ.FHnAKuqP6tiyoRqVvZWuoMsScB7NMOaprca5RReE5xk';

try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  console.log("SUCCESS:", decoded);
} catch (e) {
  console.error("FAIL:", e.message);
}
