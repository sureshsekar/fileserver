let fileDirectories = process.platform=='linux'?{
     "fileServerBaseDirectory":"/var/www/html/CobeWF/STAGING/",
     "configBaseDirectory":"/var/www/html/CobeWF/STAGING/ConfigData/"
}:
{
     "fileServerBaseDirectory":"C:/CobeWF/STAGING/",
     "configBaseDirectory":"C:/CobeWF/STAGING/ConfigData/"
}
;

module.exports = {
     port : 3200,
     queueSec : 50,
     debugFlag : true,
     fileServerBaseDirectory : fileDirectories.fileServerBaseDirectory,
     configBaseDirectory : fileDirectories.configBaseDirectory
}
