/// <reference types="node" />
import * as dgram from 'dgram';
import { SsdpHeaders } from 'node-ssdp';
interface TV {
    name: string;
    model: string;
    ip: string;
    wifiMac: string;
}
declare class AutoSearch {
    private IPs;
    private TVs;
    private client;
    constructor();
    search(time: number): Promise<TV[]>;
    deviceUpdate(headers: SsdpHeaders, _: number, rinfo: dgram.RemoteInfo): void;
    private stopSearch;
}
export default AutoSearch;
