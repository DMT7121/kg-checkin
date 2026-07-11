const fetch = require('node-fetch');

async function test() {
  const url = 'https://script.google.com/macros/s/AKfycbyQ4Y5cQ0BCHBlmzftWq0dPVP2qNgc-PaYMklh44raSX4hDOCIyFi0bV-G6QdUbb-3D/exec';
  const body = {
    action: 'GET_OPERATIONS_CONFIG',
    role: 'admin',
    username: 'ADMIN'
  };
  
  console.log('Sending request to Google Apps Script...');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    console.log('Response status:', res.status);
    console.log('Response JSON:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

test();
