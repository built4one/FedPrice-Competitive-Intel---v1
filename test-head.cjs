const https = require('https');

async function getFilename(url) {
  return new Promise((resolve) => {
    https.request(url, { method: 'HEAD' }, (res) => {
      const disposition = res.headers['content-disposition'];
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) return resolve(match[1]);
      }
      resolve('Unknown Document');
    }).on('error', () => resolve('Unknown Document')).end();
  });
}

getFilename(`https://sam.gov/api/prod/opps/v3/opportunities/resources/files/0acb6c9f65124e4da0f342642ff592b5/download?api_key=${process.env.SAM_API_KEY}`)
  .then(console.log);
