"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_ssdp_1 = require("node-ssdp");
const request = require("request");
const SAMSUNG_TV_URN = 'urn:samsung.com:device';
class AutoSearch {
    IPs = [];
    TVs = [];
    client = new node_ssdp_1.Client();
    constructor() {
        this.client.on('response', this.deviceUpdate.bind(this));
    }
    search(time) {
        return new Promise((resolve, reject) => {
            this.client.search('ssdp:all');
            setTimeout(this.stopSearch.bind(this, resolve, reject), time || 15000);
        });
    }
    deviceUpdate(headers, _, rinfo) {
        if ((headers && headers.ST && !headers.ST.includes(SAMSUNG_TV_URN)) || this.IPs.includes(rinfo.address)) {
            return;
        }
        this.IPs.push(rinfo.address);
        request.get({ url: `http://${rinfo.address}:8001/api/v2/` }, (err, res, body) => {
            if (err || res.statusCode !== 200) {
                return;
            }
            const data = JSON.parse(body);
            this.TVs.push({
                ip: data.device.ip,
                model: data.device.modelName,
                name: data.device.name,
                wifiMac: data.device.wifiMac,
            });
        });
    }
    stopSearch(resolve) {
        this.client.stop();
        resolve(this.TVs);
    }
}
exports.default = AutoSearch;
//# sourceMappingURL=auto-search.js.map