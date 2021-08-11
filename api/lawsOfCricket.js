var web = require('Web');
var body = web.request.getBodyObject();
var queryString = web.request.queryString;
var result = 42;

if (body) {
  result = body.foo;
} else if (queryString) {
  result = queryString.foo;
}

result;
