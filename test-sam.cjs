const https = require('https');
https.get(`https://api.sam.gov/prod/opportunities/v2/search?api_key=${process.env.SAM_API_KEY}&limit=1&offset=0&solnum=75F40126R00042`, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(JSON.stringify(JSON.parse(data), null, 2)));
});
