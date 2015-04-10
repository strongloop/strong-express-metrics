var express = require('express');
var http = require('http');
var xstats = require('../');
var supertest = require('supertest');
var expect = require('chai').expect;

var onRecord;
xstats.onRecord(function(data) {
  return onRecord && onRecord(data);
});

describe('express metrics', function() {
  var app, server, request, records;
  beforeEach(function setup(done) {
    records = null;
    onRecord = function(data) {
      if (records === null)
        records = data;
      else
        records = [records, data];
    };

    app = express();
    server = http.createServer(app);
    request = supertest(server);
    // Explicitly listen on an IPv4 address '127.0.0.1'
    // Otherwise an IPv6 address may be reported by the server
    server.listen(0, '127.0.0.1', done);
  });

  afterEach(function stopServer(done) {
    server.close(done);
  });

  it('calls onRecord when the response is finished', function(done) {
    app.use(xstats(function(req, res) {
      return {
        data: {
          url: req.url,
          status: res.statusCode
        }
      };
    }));

    request.get('/does-not-exist')
      .expect(404, function(err, res) {
        if (err) return done(err);
        expect(getProp(records, 'data'))
          .to.eql({ url: '/does-not-exist', status: 404 });
        done();
      });
  });

  it('provides duration via `res.duration`', function(done) {
    app.use(xstats(function(req, res) {
      return { data: { duration: res.durationInMs } };
    }));

    request.get('/').end(function(err, res) {
      if (err) return done(err);
      expect(getProp(records, 'data'))
        .to.have.property('duration').to.be.a('number');
      done();
    });
  });

  it('handles no builder function', function(done) {
    app.use(xstats());
    request.get('/').end(function(err, res) {
      if (err) return done(err);
      expect(getProp(records, 'data')).to.eql({});
      done();
    });
  });

  it('adds `process` data', function(done) {
    app.use(xstats());
    request.get('/').end(function(err, res) {
      if (err) return done(err);
      var proc = getProp(records, 'process');
      expect(proc).to.have.property('pid', process.pid);
      expect(proc).to.include.key('workerId');
      done();
    });
  });

  it('adds `timestamp` property', function(done) {
    app.use(xstats());
    request.get('/').end(function(err, res) {
      if (err) return done(err);
      var now = Date.now();
      expect(records).to.have.property('timestamp').within(now - 300, now);
      done();
    });
  });

  it('adds `version` property', function(done) {
    var VERSION = require('../package.json').version;
    app.use(xstats());
    request.get('/').end(function(err, res) {
      if (err) return done(err);
      expect(records).to.have.property('version', VERSION);
      done();
    });
  });

  it('adds properties with Common Log data', function(done) {
    app.use(xstats());
    app.get('/bytes', function(req, res) {
      res.send('hello');
    });
    request.get('/bytes?with=query').end(function(err) {
      if (err) return done(err);
      expect(getProp(records, 'client')).to.eql({
        address: '127.0.0.1',
        id: undefined,
        username: undefined
      });

      expect(getProp(records, 'request')).to.eql({
        method: 'GET',
        url: '/bytes?with=query'
      });

      var res = getProp(records, 'response');
      expect(res).to.have.property('status', 200);
      expect(res).to.have.property('duration').a('number').within(0, 100);
      expect(res).to.include.key('bytes');
      done();
    });
  });

  it('extends default data with user-provided properties', function(done) {
    app.use(xstats(function(req, res) {
      return { client: {
        address: '10.20.30.40',
        id: 'test-app',
        username: 'test-user'
      }};
    }));
    request.get('/').end(function(err, res) {
      expect(getProp(records, 'client')).to.eql({
        address: '10.20.30.40',
        id: 'test-app',
        username: 'test-user'
      });
      done();
    });
  });

  it('catches errors from a record-builder function', function(done) {
    app.use(xstats(function(req, res) {
      throw new Error('expected test error');
    }));

    // the test passes when the process does not crash
    // and the error is not handled by express
    request.get('/not-found').expect(404, done);
  });

  it('catches errors from a record-observer function', function(done) {
    onRecord = function() { throw new Error('expected test error'); };

    app.use(xstats(function(req, res) { return {}; }));

    // the test passes when the process does not crash
    // and the error is not handled by express
    request.get('/not-found').expect(404, done);
  });

  function getProp(objOrArray, name) {
    if (Array.isArray(objOrArray))
      return objOrArray.forEach(getter);
    else
      return getter(objOrArray);

    function getter(obj) {
      if (!obj || typeof obj !== 'object')
        return '' + obj + '[' + name + ']';
      return (name in obj) ? obj[name] : 'unknown key: ' + name;
    }
  }
});
