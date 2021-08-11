include('/ofsppp/api/ppp.common.js');
var processController = require('ofs-ppp-process');
var web = require('Web');

var processId = web.request.queryString.processId;
var notedExceptionId = web.request.queryString.notedExceptionId;
var fileName = web.request.queryString.fileName;
var originalFileName = web.request.queryString.originalFileName;

//Get the first file uploaded
var file = web.request.files[Object.keys(web.request.files)[0]];

processController.uploadNotedExceptionAttachment(processId, notedExceptionId, fileName, originalFileName, file);
