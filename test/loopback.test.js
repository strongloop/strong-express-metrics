var loopback = require('loopback');
var xstats = require('../');
var supertest = require('supertest');
var expect = require('chai').expect;

var onRecord;
xstats.onRecord(function(data) {
  return onRecord && onRecord(data);
});

describe('loopback metrics', function() {
  var app, server, request, records;
  beforeEach(function setup(done) {
    records = null;
    onRecord = function(data) {
      if (records === null)
        records = data;
      else
        records = [records, data];
    };

    app = loopback();
    app.dataSource('db', { connector: 'memory' });

    var Car = loopback.createModel('Car', {
      name: String,
      id: {type: String, generated: false, id: true}
    });
    app.model(Car, { dataSource: 'db' });

    app.use(xstats());
    app.use('/api', loopback.rest());

    // Explicitly listen on an IPv4 address '127.0.0.1'
    // Otherwise an IPv6 address may be reported by the server
    app.set('host', '127.0.0.1');
    app.set('port', 0);
    app.set('legacyExplorer', false);
    server = app.listen(function() {
      request = supertest(app.get('url').replace(/\/$/, ''));
      Car.create({id: '1234', name: 'BMW'}, done);
    });
  });

  afterEach(function stopServer(done) {
    server.close(done);
  });

  it('provides model and method for static methods', function(done) {
    request.get('/api/cars').end(function(err, res) {
      if (err) return done(err);
      expect(getProp(records, 'loopback')).to.eql({
        modelName: 'Car',
        remoteMethod: 'find'
      });
      done();
    });
  });

  it('provides model, method and id for instance methods', function(done) {
    request.put('/api/cars/1234').send({}).end(function(err, res) {
      console.log(err, res.statusCode);
      if (err) return done(err);
      expect(getProp(records, 'loopback')).to.eql({
        modelName: 'Car',
        remoteMethod: 'prototype.updateAttributes',
        instanceId: 1234
      });
      done();
    });
  });

  it('provides instance id for PersistedModel.findById', function(done) {
    request.get('/api/cars/1234').end(function(err, res) {
      if (err) return done(err);
      console.log('records\n', JSON.stringify(records, null, 2), '\n');
      expect(getProp(records, 'loopback'))
        .to.have.property('instanceId', 1234);
      done();
    });
  });

  it('provides instance id for PersistedModel.deleteById', function(done) {
    request.del('/api/cars/1234').end(function(err, res) {
      if (err) return done(err);
      expect(getProp(records, 'loopback'))
        .to.have.property('instanceId', 1234);
      done();
    });
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
