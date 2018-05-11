import {USERNAME} from "../../config/constants";
import {helper} from "../../helpers/helper";
import {empire} from "../../helpers/loopHelper";
import {notifier} from "../../notifier";
import {SpawnGroup} from "../SpawnGroup";
import {Traveler} from "../Traveler";
import {ROOMTYPE_ALLEY, ROOMTYPE_SOURCEKEEPER, WorldMap} from "../WorldMap";
import {Mission} from "./Mission";
import {SurveyMission} from "./SurveyMission";

interface SurveyData {
    danger: boolean;
    mineralType?: string;
    sourceCount?: number;
    averageDistance?: number;
    owner?: string;
    lastCheckedOwner?: number;
    hasWalls?: boolean;
}

export class SurveyAnalyzer {

    private room: Room;
    private spawnGroup: SpawnGroup;
    private opName: string;
    private memory: {
        chosenRoom: string;
        nextAnalysis: number;
        surveyRooms: { [roomName: string]: SurveyData };
        dataComplete: boolean;
    };

    constructor(mission: SurveyMission) {
        this.room = mission.room;
        this.spawnGroup = mission.spawnGroup;
        this.memory = mission.memory as any;
        this.opName = mission.operation.name;
    }

    public run(): string {

        // place flag in chosen missionRoom
        if (Game.time < this.memory.nextAnalysis) { return; }
        if (this.memory.chosenRoom) {
            const room = Game.rooms[this.memory.chosenRoom];
            if (room) {
                this.placeFlag(room);
                delete this.memory.chosenRoom;
                if (Object.keys(this.memory.surveyRooms).length === 0) {
                    notifier.log(`SURVEY: no more rooms to evaluate in ${this.room.name}`);
                }
                else {
                    this.memory.nextAnalysis = Game.time + 1000;
                }
            }
            return this.memory.chosenRoom;
        }

        // analyze rooms
        let exploreRoomName;
        if (!this.memory.surveyRooms) { this.memory.surveyRooms = this.initSurveyData(); }
        exploreRoomName = this.completeSurveyData(this.memory.surveyRooms);
        if (exploreRoomName) return exploreRoomName;
        exploreRoomName = this.updateOwnershipData();
        if (exploreRoomName) return;

        let chosenRoom;
        const readyList = this.checkReady();
        if (readyList && Object.keys(readyList).length > 0) {
            chosenRoom = this.chooseRoom(readyList);
        }
        if (chosenRoom) {
            this.memory.chosenRoom = chosenRoom;
        }
        else if (this.memory.nextAnalysis < Game.time) {
            this.memory.nextAnalysis = Game.time + 1000;
        }

    }

    public findAdjacentRooms(startRoomName: string, distance = 1, filterOut: number[] = []): string[] {
        const alreadyChecked: { [roomName: string]: boolean } = {[startRoomName]: true};
        const adjacentRooms: string[] = [];
        const testRooms: string[] = [startRoomName];
        while (testRooms.length > 0) {
            const testRoom = testRooms.pop();
            alreadyChecked[testRoom] = true;
            for (const value of _.values<string>(Game.map.describeExits(testRoom))) {
                if (alreadyChecked[value]) continue;
                if (Game.map.getRoomLinearDistance(startRoomName, value) > distance) continue;
                if (_.includes(filterOut, WorldMap.roomTypeFromName(value))) continue;
                adjacentRooms.push(value);
                testRooms.push(value);
                alreadyChecked[value] = true;
            }
        }
        return adjacentRooms;
    }

    private initSurveyData(): { [roomName: string]: SurveyData } {
        const data: { [roomName: string]: SurveyData } = {};

        // find core
        const roomCoords = WorldMap.getRoomCoordinates(this.room.name);
        const coreX = "" + Math.floor(roomCoords.x / 10) + 5;
        const coreY = "" + Math.floor(roomCoords.y / 10) + 5;
        const nearestCore = roomCoords.xDir + coreX + roomCoords.yDir + coreY;
        if (Game.map.getRoomLinearDistance(this.room.name, nearestCore) <= 2 &&
            this.spawnGroup.averageAvailability > 1.5) {
            data[nearestCore] = {danger: true};
        }

        const adjacentRoomNames = this.findAdjacentRooms(this.room.name, 1, [ROOMTYPE_ALLEY]);
        for (const roomName of adjacentRoomNames) {

            let noSafePath = false;
            const roomsInPath = empire.traveler.findRoute(this.room.name, roomName,
                {allowHostile: true, restrictDistance: 1});
            if (roomsInPath) {
                for (const _roomName in roomsInPath) {
                    if (Traveler.checkOccupied(_roomName)) {
                        noSafePath = true;
                    }
                }
            }
            else {
                noSafePath = true;
            }

            const type = WorldMap.roomTypeFromName(roomName);
            if (type === ROOMTYPE_SOURCEKEEPER || noSafePath) {
                data[roomName] = {danger: true};
            }
            else {
                data[roomName] = {danger: false};
            }
        }

        return data;
    }

    private completeSurveyData(surveyRooms: { [roomName: string]: SurveyData }): string {

        for (const roomName in surveyRooms) {
            const data = surveyRooms[roomName];
            if (data.sourceCount) continue;
            const room = Game.rooms[roomName];
            if (room) {
                this.analyzeRoom(room, data);
                continue;
            }
            if (!data.danger) {
                return roomName;
            }
            else {
                if (this.room.controller.level < 8) continue;
                return roomName;
            }
        }
    }

    private analyzeRoom(room: Room, data: SurveyData) {

        // mineral
        if (!room.controller) {
            data.mineralType = room.find<Mineral>(FIND_MINERALS)[0].mineralType;
        }

        // owner
        data.owner = this.checkOwnership(room);
        data.lastCheckedOwner = Game.time;
        if (data.owner === USERNAME) {
            delete this.memory.surveyRooms[room.name];
            return;
        }

        // source info
        const roomDistance = Game.map.getRoomLinearDistance(this.room.name, room.name);
        const sources = room.find<Source>(FIND_SOURCES);
        // const roomType = WorldMap.roomTypeFromName(room.name);
        const distances = [];
        data.sourceCount = sources.length;
        for (const source of sources) {
            const ret = PathFinder.search(this.room.storage.pos, {pos: source.pos, range: 1}, {
                swampCost: 1,
                plainCost: 1,
                roomCallback: (roomName: string) => {
                    if (Game.map.getRoomLinearDistance(this.room.name, roomName) > roomDistance) {
                        return false;
                    }
                },
            });
            if (ret.incomplete) {
                notifier.log(`SURVEY: Incomplete path from ${this.room.storage.pos} to ${source.pos}`);
            }

            const distance = ret.path.length;
            distances.push(distance);
            const cartsNeeded = Mission.analyzeTransport(distance, Mission.loadFromSource(source), 12900).cartsNeeded;

            // disqualify due to source distance
            if (cartsNeeded > data.sourceCount) {
                notifier.log(`SURVEY: disqualified ${room.name} due to distance to source: ${cartsNeeded}`);
                delete this.memory.surveyRooms[room.name];
                return;
            }
        }
        data.averageDistance = _.sum(distances) / distances.length;

        // walls
        data.hasWalls = room.findStructures(STRUCTURE_WALL).length > 0;
    }

    private checkOwnership(room: Room): string {
        const flags = room.find<Flag>(FIND_FLAGS);
        for (const flag of flags) {
            if (flag.name.indexOf("mining") >= 0 || flag.name.indexOf("keeper") >= 0) {
                return USERNAME;
            }
        }

        if (room.controller) {
            if (room.controller.reservation) {
                return room.controller.reservation.username;
            }
            else if (room.controller.owner) {
                return room.controller.owner.username;
            }
        }
        else {
            for (const source of room.find<Source>(FIND_SOURCES)) {
                const nearbyCreeps = _.filter(source.pos.findInRange<Creep>(FIND_CREEPS, 1),
                    (c: Creep) => !c.owner || c.owner.username !== "Source Keeper");
                if (nearbyCreeps.length === 0) { continue; }
                return nearbyCreeps[0].owner.username;
            }
        }
    }

    private updateOwnershipData(): string {

        for (const roomName in this.memory.surveyRooms) {
            const data = this.memory.surveyRooms[roomName];
            // owner
            if (Game.time > data.lastCheckedOwner + 10000) {
                const room = Game.rooms[roomName];
                if (room) {
                    data.owner = this.checkOwnership(room);
                    if (data.owner === USERNAME) {
                        delete this.memory.surveyRooms[room.name];
                    }
                    else {
                        data.lastCheckedOwner = Game.time;
                    }
                }
                else {
                    return roomName;
                }
            }
        }
    }

    private checkReady(): { [roomName: string]: SurveyData } {

        if (!empire.underCPULimit()) {
            notifier.log(`SURVEY: avoiding placement, cpu is over limit`);
            this.memory.nextAnalysis = Game.time + 10000;
            return;
        }

        const readyList = {};

        for (const roomName in this.memory.surveyRooms) {
            const data = this.memory.surveyRooms[roomName];
            // owner
            if (!data.sourceCount) { continue; }
            // don't claim rooms if any nearby rooms with another owner
            if (data.owner) {
                return;
            }

            // spawning availability
            let availabilityRequired = this.spawnGroup.spawns.length / 3;
            if (Game.map.getRoomLinearDistance(this.room.name, roomName) > 1) { availabilityRequired = 1.2; }
            if (this.spawnGroup.averageAvailability < availabilityRequired) { continue; }
            readyList[roomName] = data;
        }

        return readyList;
    }

    private chooseRoom(readySurveyRooms: { [roomName: string]: SurveyData }): string {

        let bestScore = 0;
        let bestChoice;
        for (const roomName in readySurveyRooms) {
            const data = readySurveyRooms[roomName];
            const score = data.sourceCount * 1000 - data.averageDistance;
            if (score > bestScore) {
                bestChoice = roomName;
                bestScore = score;
            }
        }

        return bestChoice;
    }

    private placeFlag(room: Room) {
        const direction = WorldMap.findRelativeRoomDir(this.room.name, room.name);
        let opName = this.opName.substr(0, this.opName.length - 1) + direction;
        if (Game.map.getRoomLinearDistance(this.room.name, room.name) > 1) {
            opName += direction;
        }
        let opType = "mining";
        if (room.roomType === ROOMTYPE_SOURCEKEEPER) {
            opType = "keeper";
        }
        const flagName = `${opType}_${opName}`;
        helper.pathablePosition(room.name).createFlag(flagName, COLOR_GREY);
        notifier.log(`SURVEY: created new operation in ${room.name}: ${flagName}`);
        delete this.memory.surveyRooms[room.name];
    }
}
