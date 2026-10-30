const query = require('./work-query.service');
const command = require('./work-command.service');
const handler = (fn, status = 200) => async (req, res, next) => {
  try {
    req.body ||= {};
    return res.status(status).json(await fn(req));
  } catch (error) {
    return next(error);
  }
};
module.exports = {
  availability: handler(query.availability),
  departments: handler(query.departments),
  list: handler(query.list),
  detail: handler(query.detail),
  recipients: handler(query.recipients),
  schedule: handler(query.schedule),
  create: handler(command.create, 201),
  transfer: handler(command.transfer),
  edit: handler(command.edit),
  cancel: handler(command.cancel),
  complete: handler(command.complete),
  updateInfo: handler(command.updateInfo)
};
