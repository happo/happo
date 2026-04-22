const http = require('http');
const req = http.request(
  { port: process.env.HAPPO_E2E_PORT, method: 'POST', path: '/' },
  function (res) {
    res.resume();
    res.on('end', function () {
      process.exit(0);
    });
  },
);
req.write('1\n');
req.end();
