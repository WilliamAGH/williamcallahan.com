const env = process.env.NODE_ENV;
const envSuffix = env === 'production' || !env ? '' : env === 'test' ? '-test' : '-dev';

console.log('Current NODE_ENV:', env || '(not set)');
console.log('Expected suffix:', envSuffix);
console.log('\nExpected S3 file names:');
console.log('  - bookmarks' + envSuffix + '.json');
console.log('  - index' + envSuffix + '.json');
console.log('  - slug-mapping' + envSuffix + '.json');
console.log('  - heartbeat' + envSuffix + '.json');
console.log('\nBut your S3 bucket shows:');
console.log('  - bookmarks.json (no suffix!)');
console.log('  - index.json (no suffix!)');
console.log('  - slug-mapping.json (no suffix!)');
console.log('  - heartbeat.json (no suffix!)');
console.log('\nThis mismatch is causing the 404s!');