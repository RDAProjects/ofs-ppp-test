include('/ofsppp/api/ppp.common.js');
var processLogController = require('ofs-ppp-process-log');
var web = require('Web');

var date = web.request.queryString.date;
var currentCacheId = web.request.queryString.currentCacheId;
processLogController.getProcessLogs(date, currentCacheId);
