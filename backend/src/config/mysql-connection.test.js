const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { afterCreate } = require("./mysql-connection");

test("mỗi kết nối mới đặt time_zone UTC trước khi vào pool", async () => {
  const connection = Object.assign(new EventEmitter(), {
    queries: [],
    query(sql, callback) { this.queries.push(sql); callback(null); },
  });
  const result = await new Promise((resolve, reject) => afterCreate(connection, (error, conn) => (error ? reject(error) : resolve(conn))));
  assert.equal(result, connection);
  assert.deepEqual(connection.queries, ["SET time_zone = '+00:00'"]);
});
