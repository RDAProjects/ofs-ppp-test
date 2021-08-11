define('ofs-ppp', function(index, sp) {
  'use strict';

  /// --------------------------
  /// --- Constants
  /// --------------------------
  var env = sp.currentContext.site.serverRelativeUrl;
  var reg = new RegExp('/');
  env = env.replace(reg, '');
  var cacheID = 'ppp-' + env + '-';
  var cacheFY = 'ppp-' + env + '-FY-';
  var cacheProcLogs = cacheID + 'ProcLogs';

  var cacheListAll = 'ppp-' + env + '-listAllProc';
  var slidingExp = '12:00:00';
  var slidingResultsetExp = '02:00:00';

  // SharePoint Folder and File Names
  var DataDocLibName = 'OFS PPP Data';
  var DataLogsSPList = 'OFS PPP Logs';
  var ReportingDocLibName = 'OFS PPP Reporting List';
  var ProcessTemplatesFolderName = 'Process Templates';
  var ProcessesFolderName = 'Processes';
  var PersonalizationFolderName = 'Personalization';
  var JobAidsFolderName = 'Job Aids';
  var notedExceptionFolderName = 'NotedExceptionAttachments';
  var userConfigurationsFolderName = 'UserConfigurations';

  var ProcessLogsFolderName = 'Process Logs';
  var FilterFolderName = 'Filters';
  var PersonalizationGlobalFolderName = 'Global';
  var FilterFileExtension = '.pppf';
  var userConfigurationFileName = 'UserConfiguration';
  var configurationFileExtension = '.pppc';
  var ProcessTemplateFileExtension = '.pppt';
  var ProcessFileExtension = '.ppp';
  var ProcessLogFileExtension = '.plog';
  var guidRegex = new RegExp(/^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/);

  var administrators = [
    'Administrator',
    'SLOWBURN-Administrator',
    'Loesley, Barton (Contractor)',
    'Guerrero, Jaime (Contractor)',
    'Patil, Ravindra (Contractor)',
    'Agrinya, Emmanuel (Contractor)',
    'Weiner, Joseph (Contractor)',
    'Nicoletos, Anthony (Contractor)'
  ];
  var systemAdministrators = [
    'Administrator',
    'SLOWBURN-Administrator',
    'Loesley, Barton (Contractor)',
    'Guerrero, Jaime (Contractor)',
    'Patil, Ravi (Contractor)',
    'Agrinya, Emmanuel (Contractor)',
    'Weiner, Joseph (Contractor)'
  ];

  var isSysAdmin = function() {
    var user = sp.currentContext.web.currentUser.name.replace('\\', '-');
    for (var i = 0; i < systemAdministrators.length; i++) {
      if (systemAdministrators[i].toLocaleUpperCase() == user.toLocaleUpperCase()) {
        return true;
      }
    }
    return false;
  };

  /// --------------------------
  /// --- Common Functions to keep things DRY
  /// --------------------------
  var getFedFiscalYearForDate = function(date) {
    if (!date) {
      date = new Date();
    }

    if (date.getMonth() <= 8) {
      return (
        'FY' +
        date
          .getFullYear()
          .toString()
          .substring(2)
      );
    }

    return 'FY' + (date.getFullYear() + 1).toString().substring(2);
  };

  var getYears = function() {
    var currentYear = new Date().getFullYear() + 3,
      years = [];
    var startYear = 2016;
    while (startYear <= currentYear) {
      years.push(startYear++);
    }
    return years;
  };

  var getFedFiscalYearForYear = function(year) {
    if (!year) {
      var date = new Date();
      year = date.getFullYear();
    }
    return 'FY' + year.toString().substring(2);
  };

  var getSubFolder = function(spFolder, subFolderPath) {
    if (!subFolderPath.startsWith('/')) {
      subFolderPath = '/' + subFolderPath;
    }

    var docLib = spFolder.getDocumentLibrary();
    var camlBuilder = new SPCamlQueryBuilder();
    var caml = camlBuilder
      .Where()
      .TextField('FileRef')
      .EqualTo(spFolder.serverRelativeUrl + subFolderPath)
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
  };

  var ensureSubFolder = function(spFolder, subFolderPath) {
    if (!subFolderPath.startsWith('/')) {
      subFolderPath = '/' + subFolderPath;
    }

    var parentWeb = spFolder.getParentWeb();
    var rootUri = new Uri((parentWeb.url + '/' + spFolder.url).toString(), 'Absolute');
    var targetUri = new Uri((parentWeb.url + '/' + spFolder.url + subFolderPath).toString(), 'Absolute');
    var segments = targetUri.segments;

    var currentFolder = spFolder;
    for (var i = rootUri.segments.length; i < segments.length; i++) {
      currentFolder = currentFolder.ensureSubFolderExists(segments[i]);
    }

    return currentFolder;
  };

  var getFolder = function(path) {
    var web = sp.currentContext.web;
    return web.getFolderByServerRelativeUrl(path);
  };

  var docLibObj = null;
  var getDataDocLib = function() {
    if (docLibObj) {
      return docLibObj;
    }

    var web = sp.currentContext.web;
    docLibObj = web.lists.getListByListName(DataDocLibName);
    return docLibObj;
  };

  var reportingDocLibObj = null;
  var getReportingDocLib = function() {
    if (reportingDocLibObj) {
      return reportingDocLibObj;
    }

    var web = sp.currentContext.web;
    reportingDocLibObj = web.lists.tryGetList(ReportingDocLibName);
    return reportingDocLibObj;
  };

  var dataLogsSPList = null;
  var getDataLogsSPList = function() {
    if (dataLogsSPList) {
      return dataLogsSPList;
    }
    var web = sp.currentContext.web;
    return web.lists.tryGetList(DataLogsSPList);
  };

  var getProcessListItemById = function(processId) {
    if (!guidRegex.test(processId)) {
      throw Error('A PPP Process Id must be in the format of a guid. ' + processId);
    }

    var docLib = getDataDocLib();

    var camlBuilder = new SPCamlQueryBuilder();
    var caml = camlBuilder
      .Where()
      .TextField('FileLeafRef')
      .EqualTo(processId + ProcessFileExtension)
      .And()
      .TextField('FSObjType')
      .EqualTo('0')
      .ToString();

    var camlQuery = new SPCamlQuery();
    camlQuery.query = caml;
    camlQuery.viewAttributes = "Scope='RecursiveAll'";
    camlQuery.rowLimit = 1;
    var items = docLib.getItemsByQuery(camlQuery);
    if (!items || items.length < 1) {
      return undefined;
    }
    var li = items[0];
    li.fiscalYear = li.url.replace(new RegExp('^' + docLib.rootFolder.name + '/' + ProcessesFolderName + '/(FY..).*'), '$1');
    return li;
  };

  var getProcessPathByListItem = function(processListItem) {
    var url = processListItem.url;
    url = url.replace(new RegExp(processListItem.name + '$'), '');
    url = url.replace(new RegExp('^' + processListItem.getParentList().rootFolder.name + '/' + ProcessesFolderName), '');
    return url;
  };

  var getFullProcessPathByListItem = function(processListItem) {
    var url = processListItem.url;
    url = url.replace(new RegExp(processListItem.name + '$'), '');
    return url;
  };

  var getProcessTemplatePathByListItem = function(processListItem) {
    var url = processListItem.url;
    url = url.replace(new RegExp(processListItem.name + '$'), '');
    url = url.replace(new RegExp('^' + processListItem.getParentList().rootFolder.name + '/' + ProcessTemplatesFolderName), '');
    return url;
  };

  var getCurrentUser = function() {
    var currentUser = sp.currentContext.web.currentUser;
    return {
      displayName: currentUser.name,
      loginName: currentUser.loginName,
      email: currentUser.email
    };
  };

  var isAdministrator = function(user) {
    if (!user) {
      return false;
    }
    for (var i = 0; i < administrators.length; i++) {
      if (administrators[i].toUpperCase() === user.toUpperCase()) return true;
    }
    return false;
  };

  /// --------------------------
  /// --- Public API
  /// --------------------------
  return {
    //Constants
    ProcessTemplateFileExtension: ProcessTemplateFileExtension,
    ProcessFileExtension: ProcessFileExtension,
    ProcessLogFileExtension: ProcessLogFileExtension,
    PersonalizationFolderName: PersonalizationFolderName,
    FilterFolderName: FilterFolderName,
    PersonalizationGlobalFolderName: PersonalizationGlobalFolderName,
    FilterFileExtension: FilterFileExtension,
    userConfigurationFileName: userConfigurationFileName,
    configurationFileExtension: configurationFileExtension,
    guidRegex: guidRegex,
    administrators: administrators,
    systemAdministrators: systemAdministrators,
    environment: env,
    cacheID: cacheID,
    cacheFY: cacheFY,
    cacheListAll: cacheListAll,
    cacheProcLogs: cacheProcLogs,
    slidingExp: slidingExp,
    slidingResultsetExp: slidingResultsetExp,

    //Data related
    DataDocLibName: DataDocLibName,
    DataLogsSPList: DataLogsSPList,
    ProcessTemplatesFolderName: ProcessTemplatesFolderName,
    ProcessesFolderName: ProcessesFolderName,
    JobAidsFolderName: JobAidsFolderName,
    notedExceptionFolderName: notedExceptionFolderName,
    ReportingDocLibName: ReportingDocLibName,
    ProcessLogsFolderName: ProcessLogsFolderName,
    userConfigurationsFolderName: userConfigurationsFolderName,

    //Functions
    getDataDocLib: getDataDocLib,
    getReportingDocLib: getReportingDocLib,
    getDataLogsSPList: getDataLogsSPList,
    getFedFiscalYearForDate: getFedFiscalYearForDate,
    getFedFiscalYearForYear: getFedFiscalYearForYear,
    getYears: getYears,
    getCurrentUser: getCurrentUser,
    isSysAdmin: isSysAdmin,
    getFolder: getFolder,
    getSubFolder: getSubFolder,
    ensureSubFolder: ensureSubFolder,
    getProcessListItemById: getProcessListItemById,
    getProcessPathByListItem: getProcessPathByListItem,
    getFullProcessPathByListItem: getFullProcessPathByListItem,
    getProcessTemplatePathByListItem: getProcessTemplatePathByListItem,
    isAdministrator: isAdministrator
  };
}, {
  SharePoint: 'sp'
}, 'Process Library and Performance Portal');

define('ofs-ppp-process-template', '/ofsppp/api/ppp.processTemplate.js', {
  'ofs-ppp': 'ppp'
}, 'Process Library and Performance Portal - Process Template');

define('ofs-ppp-process-log', '/ofsppp/api/ppp.processLog.js', {
  'ofs-ppp': 'ppp'
}, 'Process Library and Performance Portal - Process Log');

define('ofs-ppp-process', '/ofsppp/api/ppp.process.js', {
  'ofs-ppp': 'ppp',
  'ofs-ppp-process-log': 'processLogController',
  'ofs-ppp-process-template': 'processTemplateController'
}, 'Process Library and Performance Portal - Process');

define('ofs-ppp-reporting', '/ofsppp/api/ppp.reporting.js', {
  'ofs-ppp': 'ppp',
  'ofs-ppp-process': 'processController'
}, 'Process Library and Performance Portal - Reporting');

define('ofs-ppp-personalization', '/ofsppp/api/ppp.personalization.js', {
  'ofs-ppp': 'ppp'
}, 'Process Library and Performance Portal - Personalization');
