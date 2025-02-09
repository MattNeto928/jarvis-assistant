export interface Configuration {
    ip: string;
    mac: string;
    token?: string;
    appString?: string;
    tvAppString?: string;
    nameApp?: string;
    debug?: boolean;
    port?: number;
    saveToken?: boolean;
}
export interface App {
    appId: string;
    app_type: number;
    icon: string;
    is_lock: number;
    name: string;
}
export interface Command {
    method: string;
    params: {
        Cmd?: string;
        DataOfCmd?: string;
        Option?: string;
        TypeOfRemote?: string;
        data?: string | object;
        event?: string;
        to?: string;
    };
}
export declare type WSData = {
    event?: string;
    data?: {
        token?: string;
        data?: App[];
    };
};
