const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function test() {
  const url = 'https://script.google.com/macros/s/AKfycbyQ4Y5cQ0BCHBlmzftWq0dPVP2qNgc-PaYMklh44raSX4hDOCIyFi0bV-G6QdUbb-3D/exec';
  const body = {
    action: 'GET_OPERATIONS_CONFIG',
    role: 'admin',
    username: 'ADMIN'
  };
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    console.log('Response ok:', data.ok);
    if (data.ok) {
      console.log('Teams count:', data.data.config.teams.length);
      console.log('Zones count:', data.data.config.zones.length);
      console.log('Assignments count:', data.data.config.assignments.length);
      console.log('Raw config:', JSON.stringify(data.data.config, null, 2));
    } else {
      console.log('Error message:', data.message);
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

test();
