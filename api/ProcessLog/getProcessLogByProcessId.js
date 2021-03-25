include('/ofsppp/api/ppp.common.js');
var processLogController = require('ofs-ppp-process-log');
var web = require('Web');

var processId = web.request.queryString.processId;
processLogController.getProcessLogByProcessId(processId);
