var { PrismaClient } = require('@prisma/client');

// Single shared PrismaClient for the whole process — instantiating one per
// request exhausts the database connection pool.
var prisma = new PrismaClient();

module.exports = prisma;
