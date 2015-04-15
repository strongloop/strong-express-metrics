# strong-express-metrics

An Express middleware for collecting HTTP statistics.

## Installation

```
$ npm install strong-express-metrics
```

## Usage

```js
var express = require('express');
var metrics = require('strong-express-metrics');

var app = express();
app.use(metrics());
app.listen(3000);
```

You can extend the metrics reported by the middleware by providing
a builder function. The output of this builder function will be merged
with the default record produced by the middleware.

```js
app.use(metrics(function buildRecord(req, res) {
  return {
    client: {
      id: req.authInfo.app.id,
      username: req.authInfo.user.email
    },
    data: {
      // put your custom metrics here
    }
  };
}));
```

If your application is not running inside StrongLoop's Supervisor,
you can provide a custom function to process and report the statistics.

```js
metrics.onRecord(function(data) {
  // simple statsd output
  console.log('url:%s|1|c', data.request.url);
  console.log('status:%s|1|c', data.response.status);
  console.log('response-time|%s|ms', data.duration);
});
```

## Record format

The middleware produces records in the following format.

```js
{
  version: require('./package.json').version,
  timestamp: Date.now(),
  client: {
    address: req.socket.address().address,
    id: undefined, // builder should override
    username: undefined // builder should override
  },
  request: {
    method: req.method,
    url: req.url
  },
  response: {
    status: res.statusCode,
    duration: res.durationInMs,
    bytes: undefined // TODO
  },
  process: {
    pid: process.pid,
    workerId: cluster.worker && cluster.workerId
  },
  data: {
    // placeholder for user-provided data
  },
  // extra info filled for LoopBack applications only
  loopback: {
    modelName: 'User',
    remoteMethod: 'prototype.updateAttributes',
    // instanceId is undefined for static methods
    // e.g. User.find() or User.login()
    instanceId: 1234
  }
}
```
