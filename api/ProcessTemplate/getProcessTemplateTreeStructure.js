include('/ofsppp/api/ppp.common.js');
var processTemplateController = require('ofs-ppp-process-template');
var web = require('Web');

var path = '';
var data = processTemplateController.listAllProcessTemplates(path);

var result = [];

var keys = Object.keys(data);

for (var i = 0; i < keys.length; i++) {
  var path = keys[i];

  if (path == '/') {
    continue;
  }

  var templates = data[path];
  var node = {};

  for (var j = 0; j < templates.length; j++) {
    node = {
      id: templates[j].id,
      text: templates[j].title,
      title: templates[j].title,
      name: templates[j].title,
      path: path,
      version: templates[j].version,
      createdBy: templates[j].createdBy,
      created: templates[j].created,
      a_attr:
        'templates/' +
        templates[j].title
          .split(/[_\s]/)
          .join('-')
          .toLowerCase() +
        '.html',
      activities: templates[j].activities
    };
    result.push(node);
  }
}

result;
