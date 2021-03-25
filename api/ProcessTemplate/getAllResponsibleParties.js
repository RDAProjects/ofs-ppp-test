var sp = require('SharePoint');
var lists = sp.currentContext.web.lists.toArray();
var responsibleOrganizationsList;
for (var ix in lists) {
  var list = lists[ix];
  if (list.title === 'Responsible Organizations') {
    responsibleOrganizationsList = list;
    break;
  }
}

var result = [];
if (!responsibleOrganizationsList) {
  result = [
    { value: '1234', text: 'User One' },
    { value: '2222', text: 'User two' },
    { value: '3333', text: 'User Three' },
    { value: '4444', text: 'User Four' },
    { value: '5555', text: 'User Five' }
  ];
} else {
  var items = responsibleOrganizationsList.getItems();
  for (var ix in items) {
    var item = items[ix];
    result.push({
      value: item.uniqueId,
      text: item.title
    });
  }
}

result;
