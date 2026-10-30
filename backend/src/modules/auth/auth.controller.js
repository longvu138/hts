// Route facade: HTTP handlers are grouped by responsibility.
module.exports = {
  ...require("./auth-login.controller"),
  ...require("./auth-session.controller"),
  ...require("./auth-accounts.controller"),
  ...require("./auth-password.controller"),
};
