include('/ofsppp/api/ppp.common.js');
var personalizationController = require('ofs-ppp-personalization');
var web = require('Web');
var sp = require('SharePoint');

var body = web.request.getBodyObject();
personalizationController.saveFilter(body.filter, body.global);
