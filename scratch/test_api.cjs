const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function test() {
  const url = 'https://script.google.com/macros/s/AKfycbyQ4Y5cQ0BCHBlmzftWq0dPVP2qNgc-PaYMklh44raSX4hDOCIyFi0bV-G6QdUbb-3D/exec';
  
  // 1. Get current config
  let res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'GET_OPERATIONS_CONFIG', role: 'admin', username: 'ADMIN' })
  });
  let data = await res.json();
  
  const originalConfig = data.data.config;
  const testConfig = JSON.parse(JSON.stringify(originalConfig));
  
  const todayStr = new Date().toISOString().split('T')[0];
  const dummyAssignment = {
    id: 'ASSIGN_TEST',
    date: todayStr,
    teamId: testConfig.teams[0] ? testConfig.teams[0].id : 'team_1',
    zoneId: 'A',
    shift: 'Cả ngày',
    note: 'Test assignment'
  };
  testConfig.assignments.push(dummyAssignment);
  
  // 2. Save test config
  res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'UPDATE_OPERATIONS_CONFIG', role: 'admin', username: 'ADMIN', config: testConfig })
  });
  
  // 3. Get config again
  res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'GET_OPERATIONS_CONFIG', role: 'admin', username: 'ADMIN' })
  });
  data = await res.json();
  if (data.ok) {
    const assignments = data.data.config.assignments || [];
    const testAssign = assignments.find(a => a.id === 'ASSIGN_TEST');
    console.log('Resolved test assignment:', JSON.stringify(testAssign, null, 2));
  }
  
  // 4. Restore original config
  res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'UPDATE_OPERATIONS_CONFIG', role: 'admin', username: 'ADMIN', config: originalConfig })
  });
}

test();
