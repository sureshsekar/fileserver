const cluster = require('cluster');
const clog = require('./colorlogger');
const globals = require('./globals');
const http = require('http');
http.globalAgent.maxFreeSockets = Infinity;

/* 
Function cobeConsoleLogger 
Input Params:
    string = anystring to print
Output Parms:
    consolelog with timestamp and string 
*/

function cobeConsoleLogger(string) {
    console.log(new Date().toISOString().replace('Z', '').replace('T', ' ') + " " + string);
} // cobeConsoleLogger End


if (cluster.isMaster) {
    var numWorkers = require('os').cpus().length;

    cobeConsoleLogger("MYCOBE File Server started...");
    cobeConsoleLogger("MYCOBE File Server - App listening at http://localhost:" + globals.port );
    cobeConsoleLogger("MYCOBE File Server - Master cluster setting up " + numWorkers + " workers..." );

    for (var i = 0; i < numWorkers; i++) {
        cluster.fork();
    }

    cluster.on('online', function (worker) {
        cobeConsoleLogger('MYCOBE File Server - Worker ' + worker.process.pid + ' is online');
    });

    cluster.on('exit', function (worker, code, signal) {
        cobeConsoleLogger( 'MYCOBE File Server - Worker ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
        cluster.fork();
    });
} else {
    // var app = require('express')();
    const express = require('express')
    const fs = require('fs');
    const path = require('path');
    const bodyParser = require('body-parser');

    const PizZip = require('pizzip');
    const Docxtemplater = require('docxtemplater');
    var Buffer = require('buffer');
    var shell = require('shelljs');

    const mammoth = require("mammoth");
    const cookieParser = require('cookie-parser');
    const cors = require('cors');

    process.env.fileGetCount = 0;
    process.env.fileSaveCount = 0;
    process.env.fileConfigGetCount = 0;
    process.env.fileConfigSaveCount = 0;
    process.env.fileBackupCount = 0;
    process.env.fileTotalCount = 0;

    const app = express();

    app.use(bodyParser.json({ limit: '50mb' }));
    app.use(bodyParser.urlencoded({ extended: true }))
    app.use(bodyParser.json());

    app.use(cookieParser());
    app.use(cors());
    app.options('*', cors());

//wait function can be used to pause delay
function queue(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
} //queue End

/* 
Function getFilesizeInBytes 
Input Params:
    fileName = name of the file with full path
Output Parms:
    fileSizeInBytes = actual size of the file 
*/
function getFilesizeInBytes(filename) {
    var stats = fs.statSync(filename)
    var fileSizeInBytes = stats["size"];
    return fileSizeInBytes;
} // getFilesizeInBytes End 



/* 
Function incrementFileCount
Input Params:
    string = GETFILE, SAVEFILE, BACKUPFILE, GETCONFIG, SAVECONFIG
Output Parms:
    None - Update the global process env counters.
*/

function incrementFileCount(counterType) {
    switch (counterType) {
        case 'GETFILE' :
            process.env.fileGetCount++;
            break;
        case 'SAVEFILE' :
            process.env.fileSaveCount++;
            break;
        case 'BACKUPFILE' :
            process.env.fileBackupCount++;
            break;
        case 'GETCONFIGFILE' :
            process.env.fileConfigGetCount++;
            break;
        case 'SAVECONFIGFILE' :
            process.env.fileConfigSaveCount++;
            break;
    }
    //addint to total count
    process.env.fileTotalCount = process.env.fileGetCount + process.env.fileSaveCount + process.env.fileBackupCount + process.env.fileConfigGetCount + process.env.fileConfigSaveCount; 
} // cobeConsoleLogger End

/* 
Function getFileCounters
Input Params:
    None
Output Parms:
    String - with the counts concate
*/

function getFileCounters() {
    return "GETFILE=[" + process.env.fileGetCount + "] SAVEFILE=[" + process.env.fileSaveCount + "] BACKUPFILE=[" + process.env.fileBackupCount + "] GETCONFIGFILE=["+process.env.fileConfigGetCount + "] SAVECONFIGFILE=[" + process.env.fileConfigSaveCount + "]" ;
} // getFileCounters End




/* 
Function getFileTypeDir 
Input Params:
    fileType = html, doc, docx, jpg, png, xhtml, pdf, other, xml
    Based on the file type it will get the directory associated with the fileType.  This function maps the filetype with the directories used for get / save
Output Parms:
    fileTypeDir = mapped diretory Name 
*/

function getFileTypeDir(fileType) {
    var fileTypeDir = ''
    switch (fileType) {
        case 'doc':
            fileTypeDir = "Source";
            break;
        case 'docx':
            fileTypeDir = "Source";
            break;
        case 'png':
            fileTypeDir = "Images";
            break;
        case 'jpg':
            fileTypeDir = "Images";
            break;
        case 'tiff':
            fileTypeDir = "Images";
            break;
        case 'other':
            fileTypeDir = "References";
            break;
        case 'html':
            fileTypeDir = "HTML";
            break;
        case 'xhtml':
            fileTypeDir = "XHTML";
            break;
        case 'pdf':
            fileTypeDir = "PDF";
            break;
        case 'xml':
            fileTypeDir = "XML";
            break;
        case 'backup':
            fileTypeDir = "Backups";
            break;
        case 'config':
            fileTypeDir = "CONFIG";
            break;
        case 'report':
            fileTypeDir = "RPTFILES";
            break;
        case 'support':
            fileTypeDir = "References";
            break;
        default:
            fileTypeDir = 'HTML';
            break;
    }
    return fileTypeDir;
} // getFileTypeDir End

/* 
Function getFilePath 
Input Params:
    projectName - project Name
    subProjectName - sub Project Name (sometimes sub project may not exists in this case blank)
    workObjectID - Workobject name usually refers to the filename similar directory
    fileType = html, doc, docx, jpg, png, xhtml, pdf, other, xml
Output Params:
    filePath = complete filePath generated (except the basepath and fileName)
*/
function getFilePath(projectName, subProjectName, workObjectID, fileType, backup) {

    var filePath = '';
    var fileTypeDir = '';

    if (projectName != null) {
        filePath += projectName;
    }
    if (subProjectName != null && subProjectName != '') {
        filePath += "/" + subProjectName;
    }
    if (workObjectID != null) {
        filePath += "/" + workObjectID;
    }

    fileTypeDir = getFileTypeDir(fileType);
    if (fileTypeDir != '') {      
        if(backup){
            filePath += "/" + 'Backups';
            
        }else{
            filePath += "/" + fileTypeDir;
        }        
    }

    return filePath;
} // getFilePath End



    /* Node JS File Server - GET Base Call 
    This will be used to do health Check to check the FileServer is running fine. */
    app.get('/', function (req, res) {
        var currentDate = new Date().toISOString().replace('Z', '').replace('T', ' ');
        console.log(currentDate + " MYCOBE File Server GET Called!! ");
        res.json({ "Counters = ": getFileCounters(), "status": 200, "message": "success", "Info": "MYCOBE File Server !! " + currentDate });
    })

    /* Node JS File Server - POST Base Call 
    This will be used to do health Check to check the FileServer is running fine. */
    app.post('/', function (req, res) {
        var currentDate = new Date().toISOString().replace('Z', '').replace('T', ' ');
        console.log(currentDate + " MYCOBE File Server POST Called!! ");
        res.json({  "Counters = ": getFileCounters(), "status": 200, "message": "success", "Info": "MYCOBE File Server !! " + currentDate });
    })

    /* This will be move to dummy function call - Anand will change this to dummy service call at the end. */
    app.post('/doc2html/', function (req, res) {

        console.log(clog.fg.Green, "File server called...");
        console.log(clog.fg.Yellow, "Doc2html running...");
        //console.time("saveWOFile");
        var workObjectID = req.body.workObjectID;
        var WOFilePath = req.body.WOFilePath;
        var fileName = req.body.fileName;
        var fileType = req.body.fileType;
        var fullServerFilePath = WOFilePath;
        var fileSize = getFilesizeInBytes(WOFilePath);
        queue(globals.queueSec).then(() => {

            mammoth.convertToHtml({ path: WOFilePath })
                .then(function (result) {
                    var doc2htmlcontent = result.value; // The generated HTML
                    var messages = result.messages; // Any messages, such as warnings during conversion
                    console.log(clog.fg.Green, "Doc2HTML data send...");
                    console.log(clog.fg.Cyan, "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
                    console.log(clog.fg.Green, "Status - Success..");
                    console.log(clog.fg.Cyan, "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
                    res.json({ "fileContent": doc2htmlcontent, "fileType": fileType, "fileSize": fileSize, "status": 200, "error": false, "message": "success" });

                })

        })

    })
    //doc2html end - will be moved to dummy service


    
    /* 
    Function getWOFile (POST CALL)
    Input Params:
        workObjectID - Work Object ID
        projectName - project Name
        subProjectName - sub Project Name (sometimes sub project may not exists in this case blank)
        fileName = full File Name
        fileType = html, doc, docx, jpg, png, xhtml, pdf, other, xml
    Output Params:
        JSON - Error file not found
        JSON - Readed file and filesize data
    */
    app.post('/getWOFile', function (req, res) {

        var workObjectID = req.body.workObjectID;
        var projectName = req.body.projectName;
        var subProjectName = req.body.subProjectName;
        var fileName = req.body.fileName;
        var fileType = req.body.fileType;
        var backup = req.body.backup=='true'?true:false;
        var fullFilePath = '';
        var filePath = '';

        if (globals.debugFlag)
            cobeConsoleLogger("getWOFile Started for WO=[" + workObjectID + "] PROJ=[" + projectName + "] SUBPROJ=[" + subProjectName + "] file=[" + fileName + "] Type=[" + fileType + "] ");

        if (workObjectID == undefined || projectName == undefined  || fileName == undefined) {
            if (globals.debugFlag)
                cobeConsoleLogger(" Mandatory POST elements missing workObjectID [" + workObjectID + "] projectName [" + projectName + "] fileName [" + fileName + "]" );
            
            res.json({ "data": "Mandatory elements in POST missing workObjectID [" + workObjectID + "] projectName [" + projectName + "] fileName [" + fileName + "]", "status": 200, "error": true, "message": "failure" });
            return;
        }
    

        try {

            filePath = getFilePath(projectName, subProjectName, workObjectID, fileType, backup);
            fullFilePath = globals.fileServerBaseDirectory + filePath + "/" + fileName;

            if (globals.debugFlag)
                cobeConsoleLogger(" Trying to Access File [" + fullFilePath + "]");

            if (fs.existsSync(fullFilePath)) {
                var fileContent = fs.readFileSync(fullFilePath, 'binary');
                var fileContentToSend = fileContent.toString('base64');
                var fileSize = getFilesizeInBytes(fullFilePath);
                incrementFileCount('GETFILE');

                if (globals.debugFlag)
                    cobeConsoleLogger("Cnt [" + process.env.fileGetCount + "] Sending file - [" + fullFilePath + "] Size [" + fileSize + "]");

                res.json({ "data": fileContentToSend, "fileType": fileType, "fileSize": fileSize, "status": 200, "error": false, "message": "success" });
            }
            else {
                cobeConsoleLogger(" Error - File Not Found - [" + fullFilePath + "] ");
                res.json({ "data": "", "status": 404, "error": true, "message": "File Not found on server " + filePath });
            }

        }
        catch (ex) {
            cobeConsoleLogger(" Error - File Not Found - [" + fullFilePath + "] Ex = " + ex);
            res.json({ "data": "", "status": 404, "error": true, "message": "[Exception] File Not found on server " + filePath });
        }

    })
    //getWOFile End



    /* 
    Function saveWOFile 
    Input Params:
        workObjectID - Work Object ID
        projectName - project Name
        subProjectName - sub Project Name (sometimes sub project may not exists in this case blank)
        fileName = full File Name
        fileType = html, doc, docx, jpg, png, xhtml, pdf, other, xml
        fileContent = complete data of the file
        backupFlag = whether to do backup for the save or not.
        processName = Process for which we are taking backup - it will be appended to the filename
    Output Params:
        JSON - Error file not found (directory for saving create error)
        JSON - Saved file success 
    */
    app.post('/saveWOFile/', function (req, res) {

        var workObjectID = req.body.workObjectID;
        var projectName = req.body.projectName;
        var subProjectName = req.body.subProjectName;
        var fileName = req.body.fileName;
        var fileType = req.body.fileType;
        var backupFlag = req.body.backupFlag;
        var processName = req.body.processName
        var fileData = req.body.fileContent;

        var fullFilePath = '';
        var filePath = '';
        var fileDirPath = '';

        var fullFilePathBackup = '';
        var filePathBackup = '';
        var fileDirPathBackup = '';
        var fileNameBackup = '';


        if (globals.debugFlag)
            cobeConsoleLogger("saveWOFile Started for WO=[" + workObjectID + "] PROJ=[" + projectName + "] SUBPROJ=[" + subProjectName + "] file=[" + fileName + "] Type=[" + fileType + "] Backup=[" + backupFlag + "] process=[" + processName + "]");

        if (workObjectID == undefined || projectName == undefined  || fileName == undefined) {
            if (globals.debugFlag)
                cobeConsoleLogger(" Mandatory POST elements missing workObjectID [" + workObjectID + "] projectName [" + projectName + "] fileName [" + fileName + "]" );
            
            res.json({ "data": "Mandatory elements in POST missing workObjectID [" + workObjectID + "] projectName [" + projectName + "] fileName [" + fileName + "]", "status": 200, "error": true, "message": "failure" });
            return;
        }

        filePath = getFilePath(projectName, subProjectName, workObjectID, fileType);
        fullFilePath = globals.fileServerBaseDirectory + filePath + "/" + fileName;
        fileDirPath = globals.fileServerBaseDirectory + filePath + "/";

        if (globals.debugFlag)
            cobeConsoleLogger(" Trying to Save File [" + fullFilePath + "]");

        if (!fs.existsSync(fileDirPath)) {
            if (globals.debugFlag)
                cobeConsoleLogger(" Trying to Create File Directory [" + fileDirPath + "]");

            fs.mkdirSync(fileDirPath, { recursive: true, mode:0o777 }, (err) => {
                if (err) {
                    cobeConsoleLogger(" Failed to Create File Directory [" + fileDirPath + "]");
                    res.json({ "data": "Unable to create directory" + filePath, "status": 200, "error": true, "message": "failure" });
                }
            });
        }

        if (backupFlag == "true") {
            filePathBackup = getFilePath(projectName, subProjectName, workObjectID, "backup");
            fileNameBackup = path.parse(fileName).name + "_" + processName + path.parse(fileName).ext;
            fullFilePathBackup = globals.fileServerBaseDirectory + filePathBackup + "/" + fileNameBackup;
            fileDirPathBackup = globals.fileServerBaseDirectory + filePathBackup + "/";

            if (globals.debugFlag)
                cobeConsoleLogger(" Trying to Save File [" + fullFilePathBackup + "]");
            if (!fs.existsSync(fileDirPathBackup)) {
                if (globals.debugFlag)
                    cobeConsoleLogger(" Trying to Create File Directory [" + fileDirPathBackup + "]");

                fs.mkdirSync(fileDirPathBackup, { recursive: true }, (err) => {
                    if (err) {
                        cobeConsoleLogger(" Failed to Create File Directory [" + fileDirPathBackup + "]");
                        res.json({ "data": "Unable to create directory" + fileDirPathBackup, "status": 200, "error": true, "message": "failure" });
                    }
                });
            }
        }

        try {
            fs.writeFileSync(fullFilePath, fileData);
            incrementFileCount('SAVEFILE');

            if (globals.debugFlag)
                cobeConsoleLogger("Cnt [" + process.env.fileSaveCount + "] Saved file - [" + fullFilePath + "] ");

            if (backupFlag == "true") {
                fs.writeFileSync(fullFilePathBackup, fileData);
                incrementFileCount('BACKUPFILE');
                if (globals.debugFlag)
                    cobeConsoleLogger("Cnt [" + process.env.fileSaveCount + "] Saved Backup file - [" + fullFilePathBackup + "] ");
            }

            res.json({ "data": "The file was saved!", "status": 200, "error": false, "message": "success" });
        }
        catch (error) {
            cobeConsoleLogger("Error [" + error + "] Save file Error - [" + fullFilePath + "] ");
            res.json({ "data": "File Save Error!", "status": 502, "error": true, "message": "failure" });
        }
    })
    //saveWOFile End



/* 
    Function getWOConfigFile (POST CALL)
    Input Params:
        configID - configID Information
        processName - process Name - To which process the configuration needed.
    Output Params:
        JSON - Error file not found
        JSON - Saved JSON Configuration file and filesize data
    */
   app.post('/getWOConfigFile', function (req, res) {

    var configID = req.body.configID;
    var processName = req.body.processName;
    var filePath = '';
    var fullFilePath = '';

    if (globals.debugFlag)
        cobeConsoleLogger("getWOConfigFile Started for configID=[" + configID + "] processName=[" + processName + "] ");

    if (configID == undefined || processName == undefined ) {
        if (globals.debugFlag)
            cobeConsoleLogger(" Mandatory POST elements missing configID [" + configID + "] processName [" + processName + "]" );
        
        res.json({ "data": "Mandatory elements in POST missing configID [" + configID + "] processName [" + processName + "]", "status": 200, "error": true, "message": "failure" });
        return;
    }
    

    try {

        filePath = configID + "/" + processName + ".json";
        fullFilePath = globals.configBaseDirectory + filePath;

        if (globals.debugFlag)
            cobeConsoleLogger(" Trying to Access Config File [" + fullFilePath + "]");

        if (fs.existsSync(fullFilePath)) {
            var fileContent = fs.readFileSync(fullFilePath, 'binary');
            var fileContentToSend = fileContent.toString('base64');
            var fileSize = getFilesizeInBytes(fullFilePath);
            incrementFileCount('GETCONFIGFILE');

            if (globals.debugFlag)
                cobeConsoleLogger("Cnt [" + process.env.fileConfigGetCount + "] Sending file - [" + fullFilePath + "] Size [" + fileSize + "]");

            res.json({ "data": fileContentToSend, "fileType": "JSON", "fileSize": fileSize, "status": 200, "error": false, "message": "success" });
            return;
        }
        else {
            cobeConsoleLogger(" Error - File Not Found - [" + fullFilePath + "] ");
            res.json({ "data": "", "status": 404, "error": true, "message": "File Not found on server " + filePath });
            return;
        }

    }
    catch (ex) {
        cobeConsoleLogger(" Error - File Not Found - [" + fullFilePath + "] Ex = " + ex);
        res.json({ "data": "", "status": 404, "error": true, "message": "[Exception] File Not found on server " + filePath });
        return;
    }

})
//getWOCOnfigFile End

/* 
Function saveWOConfigFile 
Input Params:
    configID - configID Information
    processName - process Name - To which process the configuration needed.
    fileContent = complete data of the file
Output Params:
    JSON - Error Config file not found (directory for saving create error)
    JSON - Saved file success 
*/
app.post('/saveWOConfigFile/', function (req, res) {

    var configID = req.body.configID;
    var processName = req.body.processName
    var fileData = req.body.fileContent;

    var filePath = '';
    var fullFilePath = '';
    var fileDirPath = '';

    if (globals.debugFlag)
        cobeConsoleLogger("saveWOConfigFile Started for configID=[" + configID + "] processName=[" + processName + "] ");

    if (configID == undefined || processName == undefined ) {
        if (globals.debugFlag)
            cobeConsoleLogger(" Mandatory POST elements missing configID [" + configID + "] processName [" + processName + "]" );
        
        res.status(500).json({ "data": "Mandatory elements in POST missing configID [" + configID + "] processName [" + processName + "]", "status": 500, "error": true, "message": "failure" });
        return;
    }

    filePath = configID + "/" + processName + ".json";
    fullFilePath = globals.configBaseDirectory + filePath;
    fileDirPath =  globals.configBaseDirectory + configID + "/";

    if (globals.debugFlag)
        cobeConsoleLogger(" Trying to Save Config File [" + fullFilePath + "]");

    if (!fs.existsSync(fileDirPath)) {
        if (globals.debugFlag)
            cobeConsoleLogger(" Trying to Create Config File Directory [" + fileDirPath + "]");

        fs.mkdirSync(fileDirPath, { recursive: true }, (err) => {
            if (err) {
                cobeConsoleLogger(" Failed to Create File Directory [" + fileDirPath + "]");
                res.json({ "data": "Unable to create Config directory" + filePath, "status": 502, "error": true, "message": "failure" });
                return;
            }
        });
    }

    try {
        fs.writeFileSync(fullFilePath, fileData);
        incrementFileCount('SAVECONFIGFILE');

        if (globals.debugFlag)
            cobeConsoleLogger("Cnt [" + process.env.fileConfigSaveCount + "] Saved Config file - [" + fullFilePath + "] ");

        res.json({ "data": "The Config file was saved!", "status": 200, "error": false, "message": "success" });
        return;
    }
    catch (error) {
        cobeConsoleLogger("Error [" + error + "] Save Config file Error - [" + fullFilePath + "] ");
        res.json({ "data": "File Config Save Error!", "status": 502, "error": true, "message": "failure" });
        return;
    }
})
//saveWOConfigFile End


/* 
    Function deleteWOConfigFile (POST CALL)
    Input Params:
        configID - configID Information
        processName - process Name - To which process the configuration needed. (can be fileName also without .json)
    Output Params:
        JSON - Error file not found
        JSON - Saved JSON Configuration file and filesize data
    */
   app.post('/deleteWOConfigFile', function (req, res) {

    var configID = req.body.configID;
    var processName = req.body.processName;
    var filePath = '';      
    var fullFilePath = '';

    if (globals.debugFlag)
        cobeConsoleLogger("deleteWOConfigFile Started for configID=[" + configID + "] processName=[" + processName + "] ");

    if (configID == undefined || processName == undefined ) {
        if (globals.debugFlag)
            cobeConsoleLogger(" Mandatory POST elements missing configID [" + configID + "] processName [" + processName + "]" );
        
        res.json({ "data": "Mandatory elements in POST missing configID [" + configID + "] processName [" + processName + "]", "status": 200, "error": true, "message": "failure" });
        return;
    }
    

    try {

        filePath = configID + "/" + processName + ".json";
        fullFilePath = globals.configBaseDirectory + filePath;

        if (globals.debugFlag)
            cobeConsoleLogger(" Trying to Access Config File [" + fullFilePath + "]");

        if (fs.existsSync(fullFilePath)) {
            fs.unlinkSync(fullFilePath);

            if (globals.debugFlag)
                cobeConsoleLogger("Delete file - [" + fullFilePath + "] ");

            res.json({  "status": 200, "error": false, "message": "Config File Deleted Successfully!!" });
            return;
        }
        else {
            cobeConsoleLogger(" Error - File Not Found - [" + fullFilePath + "] ");
            res.json({ "data": "", "status": 404, "error": true, "message": "File Not found on server " + filePath });
            return;
        }

    }
    catch (ex) {
        cobeConsoleLogger(" Error - File Not Found - [" + fullFilePath + "] Ex = " + ex);
        res.json({ "data": "", "status": 404, "error": true, "message": "[Exception] File Not found on server " + filePath });
        return;
    }

})
//deleteWOCOnfigFile End


    /* Node JS File Server - GET Health Check Call 
    This will be used to do health Check to check the FileServer is running fine. */
    app.get('/healthCheck', function (req, res) {
        cobeConsoleLogger(" MYCOBE File Server Health Check !! Get Call!! ");
        res.json({ "Counters = ": getFileCounters(), "status": 200, "message": "success", "Info": "MYCOBE File Server Health Check!! Get Call!! " });
        return;
    })

    /* Node JS File Server - POST Health Check Call 
    This will be used to do health Check to check the FileServer is running fine. */
    app.post('/healthCheck', function (req, res) {
        cobeConsoleLogger(" MYCOBE File Server Health Check POST Call!! ");
        res.json({ "Counters = ": getFileCounters(), "status": 200, "message": "success", "Info": "MYCOBE File Server Health Check POST Call!! "  });
        return;
    })


    app.all('/*', function (req, res) {
        cobeConsoleLogger("[Error] = Invalid Process Call!! Unknown Call to server!! ");
        res.json({ "status": 200, "message": "failure", "Info": "Error = [Invalid Process Call!!]] " });
        return;
    });

    var server = app.listen(globals.port, function () {
        cobeConsoleLogger('Port : ' + globals.port + ' - Process ' + process.pid + ' is listening to all incoming requests');
    });
}