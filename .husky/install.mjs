// Skip Husky install in production and CI
if (process.env.NODE_ENV === 'production' || process.env.CI === 'true' || process.env.HUSKY === '0') {
  process.exit(0);
}

try {
  const husky = (await import('husky')).default;
  console.log('Setting up Husky git hooks...');
  console.log(husky());
  console.log('Husky git hooks installed successfully!');
} catch (error) {
  console.error('Failed to install Husky git hooks:', error);
  process.exit(1);
}