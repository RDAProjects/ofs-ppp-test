include('/ofsppp/api/ppp.common.js');
var processController = require('ofs-ppp-process');
var web = require('Web');

var processId = web.request.queryString.processId;
var activityId = web.request.queryString.activityId;
var fileName = web.request.queryString.fileName;
var originalFileName = web.request.queryString.originalFileName;

//Get the first file uploaded
var file = web.request.files[Object.keys(web.request.files)[0]];

processController.uploadProcessActivityAttachment(processId, activityId, fileName, originalFileName, file);
