// Jest global setup — runs before each test file.
// Jest sets NODE_ENV='test' automatically, which makes env.js skip its
// required-variable hard-exit. We still provide harmless defaults so any
// module that reads these does not see undefined.
process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
process.env.DB_HOST    = process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT    = process.env.DB_PORT || '5432';
process.env.DB_NAME    = process.env.DB_NAME || 'Varuna Nexus Test';
process.env.DB_USER    = process.env.DB_USER || 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';

// Keep test output readable — silence the noisy info/log lines that modules
// print on import. Warnings and errors still surface.
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
