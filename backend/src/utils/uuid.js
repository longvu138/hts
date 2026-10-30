const { randomUUID } = require('node:crypto');

const createUuid = () => randomUUID();

module.exports = {
  createUuid,
};
