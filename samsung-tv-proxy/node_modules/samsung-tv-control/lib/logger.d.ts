interface LoggerConfig {
    DEBUG_MODE: boolean;
}
declare class Logger {
    private DEBUG;
    private LogFile;
    constructor(config: LoggerConfig);
    log(message: string, logData: object | string, funcName?: string): void;
    error(message: string, logData: object | string, funcName?: string): void;
    saveLogToFile(): void;
    private _addLogItem;
    private _printLog;
}
export default Logger;
