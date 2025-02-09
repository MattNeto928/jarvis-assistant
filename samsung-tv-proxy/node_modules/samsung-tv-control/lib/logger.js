"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
var TypeLog;
(function (TypeLog) {
    TypeLog["ERROR"] = "ERROR";
    TypeLog["LOG"] = "LOG";
})(TypeLog || (TypeLog = {}));
class Logger {
    DEBUG = false;
    LogFile = [];
    constructor(config) {
        this.DEBUG = config.DEBUG_MODE;
    }
    log(message, logData, funcName) {
        this._addLogItem(TypeLog.LOG, message, logData, funcName);
    }
    error(message, logData, funcName) {
        this._addLogItem(TypeLog.ERROR, message, logData, funcName);
    }
    saveLogToFile() {
        const nameOfFile = `log-${new Date().toISOString()}.txt`;
        const file = fs.createWriteStream(nameOfFile);
        file.on('error', (err) => {
            console.error('ERROR: Failed to write log file!', err);
            console.error('LOG File will be output in console!');
            console.info('----- LOG ------');
            this.LogFile.forEach((item) => console.info(this._printLog(item)));
            console.info('-- END OF LOG --');
        });
        file.on('finish', () => {
            console.log(`Wrote log to file "${nameOfFile}"`);
        });
        this.LogFile.forEach((item) => {
            file.write(this._printLog(item) + '\n');
        });
        file.end();
    }
    _addLogItem(type, message, logData, funcName) {
        if (!this.DEBUG) {
            return;
        }
        let cnsl;
        switch (type) {
            case TypeLog.ERROR:
                cnsl = console.error;
                break;
            case TypeLog.LOG:
                cnsl = console.info;
                break;
            default:
                cnsl = console.log;
                break;
        }
        this.LogFile.push({
            funcName,
            logData,
            message,
            time: new Date().toISOString(),
            type,
        });
        if (funcName) {
            cnsl(`# [${new Date().toISOString()}] #`);
            cnsl('FUNCTION:', funcName);
            cnsl(type, message);
            cnsl(logData);
            cnsl('### ### ###\n');
            return;
        }
        cnsl(`# [${new Date().toISOString()}] #`);
        cnsl(type, message);
        cnsl(logData);
        cnsl('### ### ###\n');
    }
    _printLog(item) {
        return `[${item.time}] ${item.type}${item.funcName ? ' "' + item.funcName + '": ' : ''} ${item.message} - ${JSON.stringify(item.logData, null, 2)}`;
    }
}
exports.default = Logger;
//# sourceMappingURL=logger.js.map