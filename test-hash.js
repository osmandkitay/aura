const bcrypt = require('bcryptjs');

const hash = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

const testPasswords = [
  'password123',
  'password',
  'secret',
  'test',
  'admin', 
  'demo',
  'hello',
  'world',
  '123456',
  'qwerty',
  'demo123',
  'aura123',
  'demo@aura.dev'
];

console.log('Testing hash against common passwords...');
testPasswords.forEach(pwd => {
  const result = bcrypt.compareSync(pwd, hash);
  console.log(`${pwd}: ${result}`);
});

// Let's also test some variations
console.log('\nTesting some variations...');
const variations = ['password', 'PASSWORD', 'Password', 'pass', 'word'];
variations.forEach(pwd => {
  const result = bcrypt.compareSync(pwd, hash);
  console.log(`${pwd}: ${result}`);
}); 