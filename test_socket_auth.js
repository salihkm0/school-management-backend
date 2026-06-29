const io = require('socket.io-client');
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5ZTQ3OTA1ZWM4Mjk5MjkzMWFhNzNmYiIsInJvbGUiOiJzdGFmZiIsImVtYWlsIjoidGVhY2hlcjFAc2Nob29sLmNvbSIsInBob25lIjoiOTg3NjU0MzIxMCIsImlhdCI6MTc4MjQ2NDMzOCwiZXhwIjoxNzgzMDY5MTM4fQ.FHnAKuqP6tiyoRqVvZWuoMsScB7NMOaprca5RReE5xk';

const socket = io('http://127.0.0.1:5055', {
  transports: ['websocket'],
  query: { token },
  extraHeaders: { 'Authorization': `Bearer ${token}` },
  forceNew: true
});

socket.on('connect', () => {
  console.log('Connected!');
  socket.disconnect();
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.log('Connection error:', err.message);
  process.exit(1);
});
