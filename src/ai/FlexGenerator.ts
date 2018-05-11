import {helper} from "../helpers/helper";
import {Coord} from "../interfaces";

export class FlexGenerator {

    public leftMost = 0;
    public rightMost = 0;
    public topMost = 0;
    public bottomMost = 0;

    public radius = 0;
    public centerPosition: RoomPosition;
    public rotation: number;

    public coreStructureCoordinates: { [structureType: string]: Coord[] };
    public remaining = {
        [STRUCTURE_TOWER]: 6,
        [STRUCTURE_EXTENSION]: 60,
        [STRUCTURE_OBSERVER]: 1,
    };

    public roomName: string;
    public map: { [x: number]: { [y: number]: string } } = {};

    public roadPositions: RoomPosition[] = [];
    public noRoadAccess: Coord[] = [];
    public wallCount: number;
    public recheckCount = 0;

    constructor(centerPosition: RoomPosition,
                rotation: number,
                staticStructures: { [structureType: string]: Coord[] }) {
        if (!(centerPosition instanceof RoomPosition)) {
            centerPosition = helper.deserializeRoomPosition(centerPosition);
        }

        this.centerPosition = centerPosition;
        this.roomName = centerPosition.roomName;
        this.rotation = rotation;
        this.leftMost = centerPosition.x;
        this.rightMost = centerPosition.x;
        this.topMost = centerPosition.y;
        this.bottomMost = centerPosition.y;

        this.coreStructureCoordinates = staticStructures;
    }

    public generate(): { [structureType: string]: Coord[] } {
        this.addFixedStructuresToMap();
        this.addUsingExpandingRadius();
        this.addWalls();
        this.removeStragglingRoads();
        return this.generateCoords();
    }

    public addUsingExpandingRadius() {
        let iterations = 0;
        while (_.sum(this.remaining) > 0 && iterations < 100) {
            iterations++;
            for (let xDelta = -this.radius; xDelta <= this.radius; xDelta++) {
                const x = this.centerPosition.x + xDelta;
                if (x < 3 || x > 46) { continue; }

                for (let yDelta = -this.radius; yDelta <= this.radius; yDelta++) {
                    // only consider points on perimeter of gradually expanding rectangle
                    if (Math.abs(yDelta) !== this.radius && Math.abs(xDelta) !== this.radius) continue;

                    const y = this.centerPosition.y + yDelta;
                    if (y < 3 || y > 46) { continue; }

                    const position = new RoomPosition(x, y, this.roomName);
                    if (position.lookFor(LOOK_TERRAIN)[0] === "wall") continue;

                    this.addRemaining(xDelta, yDelta);
                }
            }
            this.radius++;
        }

        if (iterations === 100) {
            console.log("WARNING: layout process entered endless loop, life is terrible, give up all hope");
        }
    }

    public addRemaining(xDelta: number, yDelta: number, save = true): boolean {

        const x = this.centerPosition.x + xDelta;
        const y = this.centerPosition.y + yDelta;
        const alreadyUsed = this.checkIfUsed(x, y);
        console.log(`alreadyUsed: ${alreadyUsed} x: ${xDelta}, y: ${yDelta}`);
        if (alreadyUsed) return;

        const position = new RoomPosition(x, y, this.roomName);
        if (Game.rooms[this.roomName]) {
            if (position.inRangeTo(position.findClosestByRange<Source>(FIND_SOURCES), 2)) return;
            if (position.inRangeTo(Game.rooms[this.roomName].controller, 3)) return;
        }

        let foundRoad = false;
        for (const roadPos of this.roadPositions) {
            if (position.isNearTo(roadPos)) {
                const structureType = this.findStructureType(xDelta, yDelta);
                console.log("findStructureType: " + structureType);
                if (structureType) {
                    this.addStructurePosition(position, structureType);
                    this.remaining[structureType]--;
                    foundRoad = true;
                    break;
                }
            }
        }

        if (!foundRoad && save) {
            this.noRoadAccess.push({x: xDelta, y: yDelta});
        }
    }

    public checkIfUsed(x: number, y: number): boolean {
        return this.map[x] !== undefined && this.map[x][y] !== undefined;
    }

    public addStructurePosition(pos: RoomPosition, structureType: string, overwrite = false) {
        if (!this.map[pos.x]) this.map[pos.x] = {};
        const existingStructureType = this.map[pos.x][pos.y];
        if (existingStructureType) {
            if (overwrite) { this.remaining[existingStructureType]++; }
            else { return; }
        }

        this.map[pos.x][pos.y] = structureType;

        if (structureType === STRUCTURE_ROAD) {
            console.log("foundRoad, add pos and recheck: " + pos);
            this.roadPositions.push(pos);
            this.recheckNonAccess();
        }
        else if (structureType !== STRUCTURE_RAMPART && structureType !== STRUCTURE_WALL) {
            if (pos.x < this.leftMost) { this.leftMost = pos.x; }
            if (pos.x > this.rightMost) { this.rightMost = pos.x; }
            if (pos.y < this.topMost) { this.topMost = pos.y; }
            if (pos.y > this.bottomMost) { this.bottomMost = pos.y; }
        }
    }

    public addWalls() {
        // push edge by 1 to make room for walls
        const leftWall = this.leftMost - 1;
        const rightWall = this.rightMost + 1;
        const topWall = this.topMost - 1;
        const bottomWall = this.bottomMost + 1;
        const allWallPositions: RoomPosition[] = [];
        const validWallPositions: RoomPosition[] = [];

        console.log(leftWall, rightWall, topWall, bottomWall);

        // mark off matrix, natural walls are impassible, all other tiles get 1
        const exitPositions: RoomPosition[] = [];
        const matrix = new PathFinder.CostMatrix();
        const lastPositionWasExit = {left: false, right: false, top: false, bottom: false};
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                let currentBorder;
                if (x === 0) {
                    currentBorder = "left";
                }
                else if (x === 49) {
                    currentBorder = "right";
                }
                else if (y === 0) {
                    currentBorder = "top";
                }
                else if (y === 49) currentBorder = "bottom";

                const position = new RoomPosition(x, y, this.roomName);
                if (position.lookFor(LOOK_TERRAIN)[0] === "wall") {
                    matrix.set(x, y, 0xff);
                    if (currentBorder) {
                        lastPositionWasExit[currentBorder] = false;
                    }
                }
                else {
                    matrix.set(x, y, 1);
                    if (currentBorder) {
                        if (!lastPositionWasExit[currentBorder]) {
                            exitPositions.push(position);
                        }
                        lastPositionWasExit[currentBorder] = true;
                    }
                }
            }
        }

        console.log(`LAYOUT: found ${exitPositions.length} exits to path from`);

        // start with every wall position being valid around the border
        for (let x = leftWall; x <= rightWall; x++) {
            for (let y = topWall; y <= bottomWall; y++) {
                if (x !== leftWall && x !== rightWall && y !== topWall && y !== bottomWall) continue;

                const position = new RoomPosition(x, y, this.roomName);
                if (position.lookFor(LOOK_TERRAIN)[0] === "wall") continue;
                allWallPositions.push(position);
                matrix.set(x, y, 0xff);
            }
        }

        // send theoretical invaders at the center from each exit and remove the walls that don't make a
        // difference on whether they reach the center
        const centerPosition = new RoomPosition(this.centerPosition.x, this.centerPosition.y, this.roomName);
        for (const wallPosition of allWallPositions) {
            let breach = false;
            matrix.set(wallPosition.x, wallPosition.y, 1);
            for (const exitPosition of exitPositions) {
                const ret = PathFinder.search(exitPosition, [{pos: centerPosition, range: 0}], {
                    maxRooms: 1,
                    roomCallback: (roomName: string): CostMatrix => {
                        if (roomName === this.roomName) {
                            return matrix;
                        }
                    },
                });
                if (!ret.incomplete && ret.path[ret.path.length - 1].inRangeTo(centerPosition, 0)) {
                    breach = true;
                    break;
                }
            }
            if (breach) {
                validWallPositions.push(wallPosition);
                matrix.set(wallPosition.x, wallPosition.y, 0xff);
            }
            else {

            }
        }

        for (const position of validWallPositions) {
            this.addStructurePosition(position, STRUCTURE_RAMPART, true);
        }
        this.wallCount = validWallPositions.length;
    }

    private addFixedStructuresToMap() {

        this.coreStructureCoordinates[STRUCTURE_ROAD] = [
            {x: 0, y: 0}, {x: 1, y: 1}, {x: 2, y: 2}, {x: -1, y: -1}, {x: -2, y: -2},
            {x: -2, y: 0}, {x: 0, y: -2}, {x: 0, y: -4}, {x: 1, y: -3}, {x: 2, y: -2},
            {x: 3, y: -1}, {x: 4, y: 0}, {x: 3, y: 1}, {x: 1, y: 3}, {x: 0, y: 4},
            {x: -1, y: 3}, {x: -3, y: 1}, {x: -4, y: 0}, {x: -3, y: -1}, {x: -1, y: -3},
        ];

        this.coreStructureCoordinates.empty = [
            {x: -1, y: -2}, {x: 1, y: -2}, {x: 2, y: -1},
        ];

        for (const structureType in this.coreStructureCoordinates) {
            const coords = this.coreStructureCoordinates[structureType];
            for (const coord of coords) {
                const position = helper.coordToPosition(coord, this.centerPosition, this.rotation);
                this.addStructurePosition(position, structureType);
            }
        }
    }

    private recheckNonAccess() {
        // if (this.recheckCount > 100) return;
        this.recheckCount++;
        if (this.recheckCount > 100) throw new Error("too fucking long");
        console.log("rechecking " + this.recheckCount, this.noRoadAccess.length);
        this.noRoadAccess = _.filter(this.noRoadAccess, (c: Coord) => !this.checkIfUsed(c.x, c.y));
        for (const coord of this.noRoadAccess) {
            this.addRemaining(coord.x, coord.y, false);
        }
    }

    private findStructureType(xDelta: number, yDelta: number): string {
        const isRoadCoord = this.checkValidRoadCoord(xDelta, yDelta);

        if (isRoadCoord) {
            return STRUCTURE_ROAD;
        }
        else {
            for (const structureType in this.remaining) {
                if (this.remaining[structureType]) {
                    return structureType;
                }
            }
        }
    }

    private generateCoords(): { [structureType: string]: Coord[] } {
        const roomPositions = {};

        for (const x in this.map) {
            for (const y in this.map[x]) {
                const structureType = this.map[x][y];
                if (structureType !== STRUCTURE_ROAD
                    && _.includes(Object.keys(this.coreStructureCoordinates), structureType)) {
                    continue;
                }
                if (!roomPositions[structureType]) roomPositions[structureType] = [];
                roomPositions[structureType].push(
                    new RoomPosition(Number.parseInt(x), Number.parseInt(y), this.roomName),
                );
            }
        }

        const flexLayoutMap = {};
        const centerPosition = new RoomPosition(this.centerPosition.x, this.centerPosition.y, this.roomName);
        for (const structureType in roomPositions) {
            const sortedByDistance = _.sortBy(
                roomPositions[structureType],
                (pos: RoomPosition) => pos.getRangeTo(centerPosition),
            );
            flexLayoutMap[structureType] = [];
            for (const position of sortedByDistance) {
                const coord = helper.positionToCoord(position, this.centerPosition, this.rotation);
                flexLayoutMap[structureType].push(coord);
            }
        }

        return flexLayoutMap;
    }

    private checkValidRoadCoord(xDelta: number, yDelta: number): boolean {
        // creates the 5-cluster pattern for extensions/roads that you can see in my rooms
        const combinedDeviance = Math.abs(xDelta) + Math.abs(yDelta);
        if (combinedDeviance % 2 !== 0) {
            return false;
        }
        else if (xDelta % 2 === 0 && combinedDeviance % 4 !== 0) {
            const pos = helper.coordToPosition({x: xDelta, y: yDelta}, this.centerPosition);

            // check narrow passage due to natural walls
            for (let direction = 2; direction <= 8; direction += 2) {
                if (pos.getPositionAtDirection(direction).lookFor(LOOK_TERRAIN)[0] === "wall") {
                    return true;
                }
            }

            return false;
        }
        else {
            return true;
        }
    }

    private removeStragglingRoads() {
        for (const x in this.map) {
            for (const y in this.map[x]) {
                const xInt = Number.parseInt(x);
                const yInt = Number.parseInt(y);
                if (xInt < this.leftMost - 1 || xInt > this.rightMost + 1
                    || yInt < this.topMost - 1 || yInt > this.bottomMost + 1) {
                    this.map[x][y] = undefined;
                }
            }
        }
    }
}
