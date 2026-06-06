const localtunnel = require('localtunnel');

(async () => {
  console.log('Starting localtunnel programmatically...');
  try {
    const tunnel = await localtunnel({ 
      port: 3000, 
      subdomain: 'barcelona-travel-guide-123' 
    });
    
    console.log('your url is:', tunnel.url);

    tunnel.on('close', () => {
      console.log('Tunnel closed event received. Exiting process...');
      process.exit(1);
    });

    tunnel.on('error', (err) => {
      console.error('Tunnel error event received:', err);
      process.exit(1);
    });
    
    // Periodically check if connection is active
    setInterval(() => {
      if (!tunnel || !tunnel.url) {
        console.log('Tunnel URL missing. Exiting...');
        process.exit(1);
      }
    }, 10000);

  } catch (err) {
    console.error('Exception during tunnel initialization:', err);
    process.exit(1);
  }
})();
