include('/ofsppp/api/ppp.common.js');
var processLogController = require('ofs-ppp-process-log');
var web = require('Web');

var body = web.request.getBodyObject();
processLogController.addLogEntryForProcess(body.processId, body.logEntry);
