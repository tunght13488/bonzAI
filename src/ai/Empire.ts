import {notifier} from "../notifier";
import {Profiler} from "../Profiler";
import {BonzaiDiplomat} from "./BonzaiDiplomat";
import {BonzaiNetwork} from "./BonzaiNetwork";
import {MarketTrader} from "./MarketTrader";
import {SpawnGroup} from "./SpawnGroup";
import {Traveler, traveler} from "./Traveler";
import {WorldMap} from "./WorldMap";

export class Empire {

    public spawnGroups: { [roomName: string]: SpawnGroup };
    public memory: {
        errantConstructionRooms: {};
    };

    public traveler: Traveler;
    public diplomat: BonzaiDiplomat;
    public map: WorldMap;
    public network: BonzaiNetwork;
    public market: MarketTrader;

    constructor() {
        if (!Memory.empire) Memory.empire = {};
        _.defaults(Memory.empire, {
            errantConstructionRooms: {},
        });
        this.memory = Memory.empire;
    }

    /**
     * Occurs before operation phases
     */

    public init() {
        this.traveler = traveler;
        this.diplomat = new BonzaiDiplomat();
        this.map = new WorldMap(this.diplomat);
        this.spawnGroups = this.map.init();
        this.network = new BonzaiNetwork(this.map, this.diplomat);
        this.network.init();
        this.market = new MarketTrader(this.network);
    }

    /**
     * Occurs after operation phases
     */

    public actions() {
        this.map.actions();
        this.network.actions();
        this.market.actions();
        this.clearErrantConstruction();
    }

    public getSpawnGroup(roomName: string) {
        if (this.spawnGroups[roomName]) {
            return this.spawnGroups[roomName];
        }
        else {
            const room = Game.rooms[roomName];
            if (room && room.find(FIND_MY_SPAWNS).length > 0 && room.controller.level > 0) {
                this.spawnGroups[roomName] = new SpawnGroup(room);
                return this.spawnGroups[roomName];
            }
        }
    }

    public underCPULimit() {
        return Profiler.proportionUsed() < .9;
    }

    public spawnFromClosest(pos: RoomPosition, body: string[], name: string) {
        let closest: SpawnGroup;
        let bestDistance = Number.MAX_VALUE;
        for (const roomName in this.spawnGroups) {
            const distance = Game.map.getRoomLinearDistance(pos.roomName, roomName);
            if (distance < bestDistance) {
                bestDistance = distance;
                closest = this.spawnGroups[roomName];
            }
        }
        return closest.spawn(body, name);
    }

    private clearErrantConstruction() {
        if (Game.time % 1000 !== 0) { return; }

        const removeErrantStatus = {};
        const addErrantStatus = {};
        for (const siteName in Game.constructionSites) {
            const site = Game.constructionSites[siteName];
            if (site.room) {
                delete this.memory.errantConstructionRooms[site.pos.roomName];
            }
            else {
                if (this.memory.errantConstructionRooms[site.pos.roomName]) {
                    site.remove();
                    // removeErrantStatus[site.pos.roomName];
                }
                else {
                    addErrantStatus[site.pos.roomName] = true;
                }
            }
        }

        for (const roomName in addErrantStatus) {
            this.memory.errantConstructionRooms[roomName] = true;
        }

        for (const roomName in removeErrantStatus) {
            notifier.log(`EMPIRE: removed construction sites in ${roomName}`);
            delete this.memory.errantConstructionRooms[roomName];
        }
    }
}
