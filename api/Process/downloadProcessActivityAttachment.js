include('/ofsppp/api/ppp.common.js');
var processController = require('ofs-ppp-process');
var web = require('Web');

var processId = web.request.queryString.processId;
var activityId = web.request.queryString.activityId;
var fileName = web.request.queryString.fileName;
var originalFileName = web.request.queryString.originalFileName;
var file = processController.getProcessActivityAttachmentFile(processId, activityId, fileName);

web.response.statusCode = 200;
web.response.contentType = 'application/octet-stream';
web.response.setHeader('Content-Disposition', 'attachment; filename="' + originalFileName + '"');
file.openBinary();
