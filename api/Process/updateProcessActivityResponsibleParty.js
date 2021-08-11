include('/ofsppp/api/ppp.common.js');
var processController = require('ofs-ppp-process');
var web = require('Web');

var body = web.request.getBodyObject();
processController.updateProcessActivityResponsibleParty(body.processId, body.activityId, body.responsibleParty);
