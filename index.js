var cluster = require('cluster');
var extend = require('util')._extend;

var VERSION = require('./package.json').version;
var debug = require('debug')('strong-express-metrics');

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
    req.__start = new Date();

    // Save the client address, as it is not available in Node v0.10
    // at the time when the response was sent
    req.__clientAddress = req.ip || req.connection.remoteAddress;

    res.on('finish', function() {
      res.durationInMs = new Date() - req.__start;

      // Performance optimization: skip when there are no observers
      if (observers.length < 1) return;

      try {
        var record = createRecord(recordBuilder, req, res);
        notifyObservers(record);
      } catch (err) {
        console.warn('strong-express-metrics ignored error', err.stack);
      }
    });
    next();
  };
}

function createRecord(builder, req, res) {
  var record = {
    version: VERSION,
    timestamp: Date.now(),
    client: {
      address: req.__clientAddress,
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

  addLoopBackInfo(record, req, res);

  var custom = builder && builder(req, res);

  if (custom) {
    for (var k in custom)
      record[k] = extend(record[k], custom[k]);
  }

  return record;
}

function addLoopBackInfo(record, req, res) {
  var ctx = req.remotingContext;
  if (!ctx) return;

  var method = ctx.method;
  var lb = record.loopback = {
    modelName: method.sharedClass ? method.sharedClass.name : null,
    remoteMethod: method.name
  };

  if (!method.isStatic) {
    lb.remoteMethod = 'prototype.' + lb.remoteMethod;
    lb.instanceId = ctx.ctorArgs && ctx.ctorArgs.id;
  } else if (/ById$/.test(method.name)) {
    // PersistedModel.findById, PersistedModel.deleteById
    lb.instanceId = ctx.args.id;
  }
}

var observers = [];

function onRecord(observer) {
  debug('Adding an observer');
  observers.push(observer);
}

function notifyObservers(data) {
  debug('Emitting metrics: ', data);
  for (var i = 0; i < observers.length; i++) {
    observers[i](data);
  }
}
