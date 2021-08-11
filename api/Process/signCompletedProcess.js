include('/ofsppp/api/ppp.common.js');
var processController = require('ofs-ppp-process');
var web = require('Web');

var body = web.request.getBodyObject();
processController.signCompletedProcess(body.processId); //added to last line in this script

/* //for pdf creation
var mustache = require('Mustache');
var doc = require('Document');
var sp = require('SharePoint');
var wk = require('WkHtmlToPdf');
var webObj = new SPWeb();

var processId = body.processId;
var process = { process: processController.getProcessById(processId) };
//add activity index to each process activity

var DataDocLibName = 'OFS PPP Data';

if (process.process) {
  for (var i = 0; i < process.process.template.activities.length; i++) {
    process.process.template.activities[i].index = i + 1;
    process.process.template.activities[i].activitiyInfo = process.process.activities[i];
    if (process.process.activities[i].responsibleParty == '') {
      process.process.template.activities[i].activitiyInfo.responsibleParty = 'No Responsible Party';
    }
  }

  //formatting dates
  process.process.initiatedOn = getCustomDateTime(new Date(process.process.initiatedOn), false);
  process.process.transactionDate = getCustomDateTime(new Date(process.process.transactionDate), true);
  if (process.process.signOff) {
    if (process.process.signOff.timeStamp) {
      process.process.signOff.timeStamp = getCustomDateTime(new Date(process.process.signOff.timeStamp), false);
    }
  }
  var docLib = webObj.lists.getListByListName(DataDocLibName);
  uploadFileToSp(docLib);
} else {
  ('No Process Found');
}

//original
processController.signCompletedProcess(body.processId);

//support functions
function uploadFileToSp(docLib) {
  var htmlTempUrl = webObj.url + '/ofsppp/api/HtmlTemplate/HtmlProess.aspx';
  var html = webObj.getFileAsString(htmlTempUrl);
  var renderHtml = mustache.render(html, process);
  //renderHtml;

  var pdfResultset = doc.html2Pdf(renderHtml);
  var processFolder = getProcessFolder(processId);

  var fileName = process.process.name.replace(/[^a-z0-9]/gi, '_') + '.pdf';
  fileName = webObj.url + '/' + encodeURIComponent(processFolder.url + '/' + fileName);

  docLib.addFile(fileName, pdfResultset, true);
}

function getProcessFolder(processId) {
  var camlBuilder = new SPCamlQueryBuilder();
  var caml = camlBuilder
    .Where()
    .TextField('FileRef')
    .Contains(processId)
    .And()
    .TextField('FSObjType')
    .EqualTo('1')
    .ToString();
  var camlQuery = new SPCamlQuery();
  camlQuery.query = caml;
  camlQuery.viewAttributes = "Scope='RecursiveAll'";
  camlQuery.rowLimit = 1;
  var items = docLib.getItemsByQuery(camlQuery);
  if (!items || items.length < 1) {
    return undefined;
  }
  return items[0].getFolder();
}

function getCustomDateTime(date, dateOnly) {
  var retVal = '';
  var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nove', 'Dec'];

  var hours = date.getHours();
  var minutes = date.getMinutes();
  var ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;

  hours = hours ? hours : 12; // the hour '0' should be '12'
  minutes = minutes < 10 ? '0' + minutes : minutes;
  var strTime = hours + ':' + minutes + ' ' + ampm;
  if (dateOnly) {
    retVal = monthNames[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
  } else {
    retVal = monthNames[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear() + ' ' + strTime;
  }
  return retVal;
}*/
