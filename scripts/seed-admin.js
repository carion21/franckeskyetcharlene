#!/usr/bin/env node
//
// One-off: create (or rotate) the backoffice admin account.
//
//   node scripts/seed-admin.js
//
// Reads ADMIN_USERNAME / ADMIN_PASSWORD from .env. Only the bcrypt hash is ever
// persisted — the plaintext password is never stored, printed or logged (PRD §6).
// Idempotent: re-running upserts the same username instead of duplicating it,
// which also makes it the way to rotate the password.

require('dotenv').config();

var bcrypt = require('bcrypt');
var prisma = require('../config/db');

var BCRYPT_ROUNDS = 12;
var MIN_PASSWORD_LENGTH = 12;

async function main() {
  var username = (process.env.ADMIN_USERNAME || '').trim();
  var password = process.env.ADMIN_PASSWORD || '';

  if (!username || !password) {
    throw new Error(
      'ADMIN_USERNAME and ADMIN_PASSWORD must both be set in .env (see .env.example)'
    );
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      'ADMIN_PASSWORD is too short — use at least ' + MIN_PASSWORD_LENGTH + ' characters'
    );
  }

  var passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  var existing = await prisma.adminUser.findUnique({ where: { username: username } });

  await prisma.adminUser.upsert({
    where: { username: username },
    update: { passwordHash: passwordHash },
    create: { username: username, passwordHash: passwordHash }
  });

  console.log(
    existing
      ? 'Admin user "' + username + '" already existed — password hash updated.'
      : 'Admin user "' + username + '" created.'
  );
}

main()
  .catch(function (err) {
    console.error('Seed failed: ' + err.message);
    process.exitCode = 1;
  })
  .finally(function () {
    return prisma.$disconnect();
  });
