include('/ofsppp/api/ppp.common.js');
var processController = require('ofs-ppp-process');
var web = require('Web');

var fiscalYear = web.request.queryString.fiscalYear;
processController.listAllProcessesForFiscalYear(fiscalYear);
