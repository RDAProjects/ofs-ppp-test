include('/ofsppp/api/ppp.common.js');
var personalizationController = require('ofs-ppp-personalization');
var web = require('Web');

var body = web.request.getBodyObject();
personalizationController.deleteFilterById(body.filterId);
