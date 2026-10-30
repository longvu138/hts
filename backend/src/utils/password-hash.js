const bcrypt = require("bcryptjs");

const BCRYPT_COST = 12;
let dummyHashPromise = null;

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);

// Compare against a fixed dummy hash when the account does not exist, so response time
// does not reveal whether a username is registered.
const getDummyHash = () => {
  dummyHashPromise ||= bcrypt.hash("hts-dummy-password-for-timing", BCRYPT_COST);
  return dummyHashPromise;
};

const verifyPassword = async (password, hash) => {
  if (!hash) {
    await bcrypt.compare(String(password || ""), await getDummyHash());
    return false;
  }
  return bcrypt.compare(String(password || ""), hash);
};

module.exports = { BCRYPT_COST, hashPassword, verifyPassword };
