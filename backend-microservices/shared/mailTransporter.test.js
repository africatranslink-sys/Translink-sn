const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { afterEach, test } = require('node:test');
const { createMailTransporter } = require('./mailTransporter');

const originalEnvironment = {
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_FROM: process.env.SMTP_FROM,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_TLS_CA_PATH: process.env.SMTP_TLS_CA_PATH,
  INTEGRATION_CONFIG_ENCRYPTION_KEY: process.env.INTEGRATION_CONFIG_ENCRYPTION_KEY,
};

const clearSmtpEnvironment = () => {
  for (const key of ['SMTP_HOST', 'SMTP_FROM', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_PASS']) {
    delete process.env[key];
  }
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const createTestDependencies = (savedConfig = null) => {
  let transportOptions;
  let encryptedConfig = null;
  if (savedConfig) {
    const iv = crypto.randomBytes(12);
    const key = crypto.createHash('sha256').update(process.env.INTEGRATION_CONFIG_ENCRYPTION_KEY).digest();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(savedConfig), 'utf8'), cipher.final()]);
    encryptedConfig = {
      ciphertext: ciphertext.toString('hex'),
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
    };
  }
  const db = {
    query: async () => ({
      rows: encryptedConfig
        ? [{ encrypted_config: encryptedConfig.ciphertext, iv: encryptedConfig.iv, auth_tag: encryptedConfig.authTag }]
        : [],
    }),
  };
  const nodemailer = {
    createTransport: (options) => {
      transportOptions = options;
      return { sendMail: async () => ({ accepted: [] }) };
    },
  };
  return { db, nodemailer, getTransportOptions: () => transportOptions };
};

test('uses Gmail app passwords without display whitespace and trims configuration', async () => {
  Object.assign(process.env, {
    SMTP_HOST: ' smtp.gmail.com ',
    SMTP_FROM: ' Translink <team@example.org> ',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: ' team@example.org ',
    SMTP_PASSWORD: 'abcd efgh ijkl mnop',
  });
  const dependencies = createTestDependencies();

  const smtp = await createMailTransporter(dependencies.db, dependencies.nodemailer);
  const options = dependencies.getTransportOptions();

  assert.equal(smtp.from, 'Translink <team@example.org>');
  assert.equal(options.host, 'smtp.gmail.com');
  assert.equal(options.secure, false);
  assert.deepEqual(options.auth, { user: 'team@example.org', pass: 'abcdefghijklmnop' });
});

test('treats the string false in saved SMTP settings as false', async () => {
  clearSmtpEnvironment();
  process.env.INTEGRATION_CONFIG_ENCRYPTION_KEY = 'test-only-encryption-key';
  const dependencies = createTestDependencies({
    host: 'smtp.example.org',
    from: 'team@example.org',
    port: '587',
    secure: 'false',
    user: 'team@example.org',
    password: ' password with spaces ',
  });

  await createMailTransporter(dependencies.db, dependencies.nodemailer);

  assert.equal(dependencies.getTransportOptions().secure, false);
  assert.deepEqual(dependencies.getTransportOptions().auth, {
    user: 'team@example.org',
    pass: 'password with spaces',
  });
});

test('uses complete .env SMTP settings instead of saved settings', async () => {
  Object.assign(process.env, {
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_FROM: 'team@example.org',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'env-user@example.org',
    SMTP_PASSWORD: 'env-password',
  });
  process.env.INTEGRATION_CONFIG_ENCRYPTION_KEY = 'test-only-encryption-key';
  const dependencies = createTestDependencies({
    host: 'smtp.saved.example.org',
    from: 'saved@example.org',
    port: 465,
    secure: true,
    user: 'saved-user',
    password: 'saved-password',
  });

  await createMailTransporter(dependencies.db, dependencies.nodemailer);

  assert.equal(dependencies.getTransportOptions().host, 'smtp.gmail.com');
  assert.deepEqual(dependencies.getTransportOptions().auth, {
    user: 'env-user@example.org',
    pass: 'env-password',
  });
});

test('returns no transport when SMTP is not configured', async () => {
  clearSmtpEnvironment();
  for (const key of ['SMTP_HOST', 'SMTP_FROM']) delete process.env[key];
  const dependencies = createTestDependencies();

  assert.equal(await createMailTransporter(dependencies.db, dependencies.nodemailer), null);
});

test('rejects an invalid SMTP port explicitly', async () => {
  Object.assign(process.env, { SMTP_HOST: 'smtp.example.org', SMTP_FROM: 'team@example.org', SMTP_PORT: 'invalid' });
  const dependencies = createTestDependencies();

  await assert.rejects(
    createMailTransporter(dependencies.db, dependencies.nodemailer),
    /port valide entre 1 et 65535/
  );
});

test('rejects an SMTP username without a password', async () => {
  Object.assign(process.env, {
    SMTP_HOST: 'smtp.example.org',
    SMTP_FROM: 'team@example.org',
    SMTP_USER: 'team',
    SMTP_PASSWORD: '',
  });
  const dependencies = createTestDependencies();

  await assert.rejects(
    createMailTransporter(dependencies.db, dependencies.nodemailer),
    /nom d’utilisateur sans mot de passe/
  );
});
