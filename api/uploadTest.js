var web = require('Web');

//Get the first file uploaded
var file = web.request.files[Object.keys(web.request.files)[0]];
file;
