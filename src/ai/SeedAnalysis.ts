import {helper} from "../helpers/helper";
import {Coord, SeedData, SeedSelection} from "../interfaces";

export class SeedAnalysis {

    public data: SeedData;
    public room: Room;

    constructor(room: Room, seedData: SeedData) {
        this.data = seedData;
        this.room = room;
    }

    public run(staticStructures?: { [structureType: string]: Coord[] }, layoutType?: string): SeedSelection {

        let layoutTypes;
        if (layoutType) {
            layoutTypes = [layoutType];
        }
        else {
            layoutTypes = ["quad", "flex"];
        }

        for (const type of layoutTypes) {
            if (!this.data.seedScan[type]) {
                this.findSeeds(type);
            }

            if (this.data.seedScan[type].length > 0) {
                if (staticStructures) {
                    const result = this.findByStructures(type, staticStructures);
                    if (result) return result;
                }
                else {
                    return this.selectSeed(type, this.data.seedScan[type]);
                }
            }
        }

        console.log(`No viable seeds in ${this.room.name}`);
    }

    public checkArea(xOrigin: number, yOrigin: number, radius: number, taper: number, area: LookAtResultMatrix) {
        for (let xDelta = -radius; xDelta <= radius; xDelta++) {
            for (let yDelta = -radius; yDelta <= radius; yDelta++) {
                if (Math.abs(xDelta) + Math.abs(yDelta) > radius * 2 - taper) continue;
                if (area[yOrigin + yDelta][xOrigin + xDelta][0] === "wall") {
                    console.log(`x: ${xOrigin} y: ${yOrigin} disqualified due to wall at ${xOrigin +
                    xDelta}, ${yOrigin + yDelta}`);
                    return false;
                }
            }
        }

        // check source proximity
        const originPosition = new RoomPosition(xOrigin, yOrigin, this.room.name);
        for (const source of this.room.find<Source>(FIND_SOURCES)) {
            if (originPosition.inRangeTo(source, radius + 2)) {
                return false;
            }
        }

        return true;
    }

    private findSeeds(seedType: string) {
        let radius;
        let wallMargin;
        let taper;
        if (seedType === "quad") {
            radius = 6;
            wallMargin = 0;
            taper = 1;
        }
        else if (seedType === "flex") {
            radius = 4;
            wallMargin = 1;
            taper = 4;
        }

        const requiredWallOffset = 2;
        const totalMargin = requiredWallOffset + radius + wallMargin;
        if (!this.data.seedScan[seedType]) {
            console.log(`AUTO: initiating seed scan: ${seedType}`);
            this.data.seedScan[seedType] = [];
        }

        let indexX = totalMargin;
        while (indexX <= 49 - totalMargin) {
            let indexY = totalMargin;
            while (indexY <= 49 - totalMargin) {
                const area = this.room.lookForAtArea(
                    LOOK_TERRAIN,
                    indexY - radius,
                    indexX - radius,
                    indexY + radius,
                    indexX + radius,
                ) as LookAtResultMatrix;

                const foundSeed = this.checkArea(indexX, indexY, radius, taper, area);
                if (foundSeed) {
                    this.data.seedScan[seedType].push({x: indexX, y: indexY});
                }
                indexY++;
            }
            indexX++;
        }

        console.log(`found ${this.data.seedScan[seedType].length} ${seedType} seeds`);
        if (this.data.seedScan[seedType].length > 0) {
            this.data.seedScan[seedType] = _.sortBy(this.data.seedScan[seedType], (c: Coord) => {
                // sort by distance to controller
                return this.room.controller.pos.getRangeTo(new RoomPosition(c.x, c.y, this.room.name));
            });
        }
    }

    private selectSeed(seedType: string, seeds: Coord[]): SeedSelection {
        let storageDelta;
        if (seedType === "quad") {
            storageDelta = {x: 0, y: 4};
        }
        else if (seedType === "flex") {
            storageDelta = {x: 0, y: -3};
        }
        else {
            console.log("unrecognized seed type");
            return;
        }

        if (!this.data.seedSelectData) {
            this.data.seedSelectData = {
                index: 0,
                rotation: 0,
                best: {seedType, origin: undefined, rotation: undefined, energyPerDistance: 0},
            };
        }

        const data = this.data.seedSelectData;
        if (data.rotation > 3) {
            data.index++;
            data.rotation = 0;
        }

        if (data.index >= seeds.length) {
            if (data.best.origin) {
                console.log(`${this.room.name} determined best seed, ${data.best.seedType} at ${data.best.origin.x},${data.best.origin.y} with rotation ${data.rotation}`);
                this.data.seedSelectData = undefined;
                return data.best;
            }
            else {
                console.log(`unable to find suitable seed selection in ${this.room.name}`);
            }
        }

        const storagePosition = helper.coordToPosition(storageDelta, new RoomPosition(
            seeds[data.index].x,
            seeds[data.index].y,
            this.room.name,
        ), data.rotation);
        let energyPerDistance = 0;
        for (const sourceDatum of this.data.sourceData) {
            const sourcePosition = helper.deserializeRoomPosition(sourceDatum.pos);
            const ret = PathFinder.search(storagePosition, [{pos: sourcePosition, range: 1}], {
                swampCost: 1,
                maxOps: 4000,
            });

            let pathLength = 100;
            if (!ret.incomplete) {
                pathLength = Math.max(ret.path.length, 50);
            }

            energyPerDistance += sourceDatum.amount / pathLength;
        }

        if (energyPerDistance > data.best.energyPerDistance) {
            console.log(`${this.room.name} found better seed, energyPerDistance: ${energyPerDistance}`);
            data.best = {
                seedType, origin: seeds[data.index], rotation: data.rotation,
                energyPerDistance,
            };
        }

        // update rotation for next tick
        data.rotation++;
    }

    private findBySpawn(seedType: string, spawn: StructureSpawn): SeedSelection {
        let spawnCoords: Coord[];
        if (seedType === "quad") {
            spawnCoords = [{x: 2, y: 0}, {x: 0, y: -2}, {x: -2, y: 0}];
        }
        else { // seedType === "flex"
            spawnCoords = [{x: -2, y: 1}, {x: -1, y: 2}, {x: 0, y: 3}];
        }

        const seeds = this.data.seedScan[seedType];
        for (const seed of seeds) {
            const centerPosition = new RoomPosition(seed.x, seed.y, this.room.name);
            for (const coord of spawnCoords) {
                for (let rotation = 0; rotation <= 3; rotation++) {
                    const testPosition = helper.coordToPosition(coord, centerPosition, rotation);
                    if (spawn.pos.inRangeTo(testPosition, 0)) {
                        console.log(`seed: ${JSON.stringify(seed)}, centerPos: ${centerPosition}, rotation: ${rotation},` +
                            `\ncoord: ${JSON.stringify(coord)} testPos: ${testPosition}, spawnPos: ${spawn.pos}`);
                        return {seedType, origin: seed, rotation, energyPerDistance: undefined};
                    }
                }
            }
        }
    }

    private findByStructures(seedType: string, staticStructures: { [structureType: string]: Coord[] }): SeedSelection {

        let mostHits = 0;
        let bestSeed;
        let bestRotation;

        const seeds = this.data.seedScan[seedType];
        for (const seed of seeds) {
            const centerPosition = new RoomPosition(seed.x, seed.y, this.room.name);
            for (let rotation = 0; rotation <= 3; rotation++) {

                let structureHits = 0;

                for (const structureType of [STRUCTURE_SPAWN, STRUCTURE_STORAGE, STRUCTURE_LAB, STRUCTURE_TERMINAL]) {
                    const coords = staticStructures[structureType];
                    for (const coord of coords) {
                        const testPosition = helper.coordToPosition(coord, centerPosition, rotation);
                        if (testPosition.lookForStructure(structureType)) {
                            structureHits++;
                        }
                    }
                }

                if (structureHits > mostHits) {
                    mostHits = structureHits;
                    bestSeed = seed;
                    bestRotation = rotation;
                }
            }
        }

        if (mostHits > 0) {
            return {seedType, origin: bestSeed, rotation: bestRotation, energyPerDistance: undefined};
        }
    }
}
