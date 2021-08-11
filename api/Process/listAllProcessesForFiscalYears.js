include('/ofsppp/api/ppp.common.js');
var processController = require('ofs-ppp-process');
var web = require('Web');

var fiscalYears = web.request.queryString.fiscalYears;
processController.listAllProcessesForFiscalYears(fiscalYears);
