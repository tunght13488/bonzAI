import {helper} from "../../helpers/helper";
import {empire} from "../../helpers/loopHelper";
import {RaidCache} from "../../interfaces";
import {notifier} from "../../notifier";
import {Operation} from "../operations/Operation";
import {SpawnGroup} from "../SpawnGroup";
import {Traveler} from "../Traveler";
import {WorldMap} from "../WorldMap";
import {Guru} from "./Guru";

export class RaidGuru extends Guru {

    public raidRoom: Room;
    public raidRoomName: string;
    public raidCreeps: Creep[] = [];
    public injuredCreeps: Creep[] = [];
    public cache: RaidCache;
    public spawnGroup: SpawnGroup;

    constructor(operation: Operation) {
        super(operation, "raidGuru");
    }

    get structures() {
        if (!this.raidRoom) return;
        return this.raidRoom.structures;
    }

    get isInitiaized(): boolean { return this.cache !== undefined; }

    get fallbackPos(): RoomPosition { if (this.cache) { return helper.deserializeRoomPosition(this.cache.fallbackPos); } }

    get expectedDamage(): number { if (this.cache) { return this.cache.expectedDamage; }}

    get avgWallHits(): number { if (this.cache) { return this.cache.avgWallHits; }}

    get matrix(): CostMatrix { if (this.cache) return PathFinder.CostMatrix.deserialize(this.cache.matrix); }

    get startTime(): number { return this.memory.startTime; }

    public init(roomName: string, safeEntrance: boolean): boolean {
        this.raidRoomName = roomName;
        this.raidRoom = Game.rooms[roomName];
        this.cache = this.memory.cache;

        if (!this.cache) {
            this.memory.cache = this.generateCache(roomName, safeEntrance);
        }

        if (!this.memory.startTime) {
            this.memory.startTime = Game.time;
        }

        return this.cache !== undefined;
    }

    private generateCache(roomName: string, safeEntrance: boolean): RaidCache {
        const room = this.observeRoom(roomName);
        if (!room) return;

        const cache = {} as RaidCache;

        const walls = this.room.findStructures<Structure>(STRUCTURE_WALL)
            .concat(this.room.findStructures<Structure>(STRUCTURE_RAMPART));
        const towers = this.room.findStructures<StructureTower>(STRUCTURE_TOWER);
        const spawns = this.room.findStructures<StructureSpawn>(STRUCTURE_SPAWN);

        const matrix = this.initMatrix(walls);
        if (safeEntrance) {
            cache.bestExit = this.findBestExit(matrix, towers, spawns);
        }
        cache.expectedDamage = this.calcExpectedDamage(towers, cache.bestExit);
        cache.avgWallHits = this.calcAverageWallHits(walls);
        cache.fallbackPos = this.findFallback(room, cache.bestExit);
        cache.matrix = matrix.serialize();

        helper.showMatrix(matrix);
        notifier.log(`ZOMBIE: init raid at ${roomName}, expectedDamage: ${cache.expectedDamage}, bestExit: ${cache.bestExit}`);
        return cache;
    }

    private initMatrix(walls: Structure[]): CostMatrix {
        const matrix = new PathFinder.CostMatrix();
        if (walls.length > 0) {
            const highestHits = _(walls).sortBy("hits").last().hits;
            for (const wall of walls) {
                matrix.set(wall.pos.x, wall.pos.y, Math.ceil(wall.hits * 10 / highestHits) * 10);
            }
        }

        return matrix;
    }

    private findBestExit(matrix: CostMatrix, towers: StructureTower[], spawns: StructureSpawn[]): RoomPosition {

        let bestExit;
        const ret = PathFinder.search(this.spawnGroup.pos, {pos: spawns[0].pos, range: 1}, {
            roomCallback: (roomName: string): CostMatrix | boolean => {
                if (roomName !== this.room.name && Traveler.checkOccupied(roomName)) { return false; }
                const room = Game.rooms[roomName];
                if (room) { return room.defaultMatrix; }
            },
        });
        if (!ret.incomplete) {
            bestExit = _.find(ret.path, (p: RoomPosition) => p.roomName === this.room.name);
        }

        const allowedExits = {};
        if (!bestExit) {
            const exitData = Game.map.describeExits(this.room.name);
            for (const direction in exitData) {
                const roomName = exitData[direction];
                const allowedRooms = empire.traveler.findRoute(this.spawnGroup.pos.roomName, roomName);
                if (allowedRooms && Object.keys(allowedRooms).length <= 8) {
                    allowedExits[direction] = true;
                }
            }

            if (Object.keys(allowedExits).length === 0) {
                return;
            }
        }

        const exitPositions: RoomPosition[] = [];
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (x !== 0 && y !== 0 && x !== 49 && y !== 49) { continue; }
                if (Game.map.getTerrainAt(x, y, this.room.name) === "wall") { continue; }
                matrix.set(x, y, 0xff);
                if (bestExit) { continue; }
                if (allowedExits["1"] && y === 0) {
                    exitPositions.push(new RoomPosition(x, y, this.room.name));
                }
                else if (allowedExits["3"] && x === 49) {
                    exitPositions.push(new RoomPosition(x, y, this.room.name));
                }
                else if (allowedExits["5"] && y === 49) {
                    exitPositions.push(new RoomPosition(x, y, this.room.name));
                }
                else if (allowedExits["7"] && x === 0) {
                    exitPositions.push(new RoomPosition(x, y, this.room.name));
                }
            }
        }

        if (!bestExit) {
            bestExit = _(exitPositions)
                .sortBy((p: RoomPosition) => -_.sum(towers, (t: Structure) => p.getRangeTo(t)))
                .head();
        }
        matrix.set(bestExit.x, bestExit.y, 1);

        return bestExit;
    }

    private calcExpectedDamage(towers: StructureTower[], bestExit: RoomPosition): number {

        if (bestExit) {
            let expectedDamage = 0;
            for (const tower of towers) {
                const range = bestExit.getRangeTo(tower);
                expectedDamage += helper.towerDamageAtRange(range);
            }
            return expectedDamage / 2;
        }
        else {
            let mostExpectedDamage = 0;
            for (const attackedTower of towers) {
                let expectedDamage = 0;
                for (const otherTower of towers) {
                    const range = attackedTower.pos.getRangeTo(otherTower);
                    expectedDamage += helper.towerDamageAtRange(range);
                }
                if (expectedDamage > mostExpectedDamage) {
                    mostExpectedDamage = expectedDamage;
                }
            }
            return mostExpectedDamage;
        }
    }

    private calcAverageWallHits(walls: Structure[]) {
        if (walls.length === 0) return 0;
        return _.sum(walls, "hits") / walls.length;
    }

    private findFallback(room: Room, bestExit?: RoomPosition): RoomPosition {
        if (bestExit) {
            const fallback = _.clone(bestExit);
            if (fallback.x === 0) {
                fallback.x = 48;
                fallback.roomName = WorldMap.findRelativeRoomName(fallback.roomName, -1, 0);
            }
            else if (fallback.x === 49) {
                fallback.x = 1;
                fallback.roomName = WorldMap.findRelativeRoomName(fallback.roomName, 1, 0);
            }
            else if (fallback.y === 0) {
                fallback.y = 48;
                fallback.roomName = WorldMap.findRelativeRoomName(fallback.roomName, 0, -1);
            }
            else {
                fallback.y = 1;
                fallback.roomName = WorldMap.findRelativeRoomName(fallback.roomName, 0, 1);
            }
            return fallback;
        }
        else {
            // TODO: standard fallback
        }
    }
}
