var cluster = require('cluster');
var extend = require('util')._extend;

/**
 * Create a middleware handler for collecting statistics.
 *
 * @callback {function} recordBuilder The builder function is called
 *   for each request, the return value is collected as a stats record.
 * @param {Request} req The express request object.
 * @param {Response} res The express response object.
 * @return {Object} A key/value map describing a stats record.
 * @end
 *
 * @header metrics(recordBuilder)
 */
module.exports = createStatsHandler;

/**
 * Register an observer function to be notified whenever a new stats record
 * is collected.
 * @callback {function} observer The observer function.
 * @param {Object} data The data returned by the record builder function.
 * @end
 *
 * @header metrics.onRecord(observer)
 */
module.exports.onRecord = onRecord;

function createStatsHandler(recordBuilder) {
  return function statistics(req, res, next) {
    var start = new Date();
    res.on('finish', function() {
      res.durationInMs = new Date() - start;

      // Performance optimization: skip when there are no observers
      if (observers.length < 1) return;

      try {
        var record = createRecord(recordBuilder, req, res);
        notifyObservers(record);
      } catch (err) {
        console.warn('strong-express-metrics ignored error', err);
      }
    });
    next();
  };
}

function createRecord(builder, req, res) {
  var record = {
    timestamp: Date.now(),
    client: {
      address: req.socket.address().address,
      // NOTE(bajtos) How to extract client-id and username?
      // Should we parse Authorization header for Basic Auth?
      id: undefined,
      username: undefined
    },
    request: {
      method: req.method,
      url: req.url
    },
    response: {
      status: res.statusCode,
      duration: res.durationInMs,
      // Computing the length of a writable stream
      // is tricky and expensive.
      bytes: undefined
    },
    process: {
      pid: process.pid,
      workerId: cluster.worker && cluster.workerId
    },
    data: {
      // placeholder for user-provided data
    }
  };

  var custom = builder && builder(req, res);

  if (custom) {
    for (var k in custom)
      record[k] = extend(record[k], custom[k]);
  }

  return record;
}

var observers = [];

function onRecord(observer) {
  observers.push(observer);
}

function notifyObservers(data) {
  for (var i = 0; i < observers.length; i++) {
    observers[i](data);
  }
}
