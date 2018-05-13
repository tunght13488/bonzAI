import {OperationPriority} from "../../config/constants";
import {helper} from "../../helpers/helper";
import {empire} from "../../helpers/loopHelper";
import {Coord, SeedData} from "../../interfaces";
import {notifier} from "../../notifier";
import {BodyguardMission} from "../missions/BodyguardMission";
import {BuilderMission} from "../missions/BuilderMission";
import {ClaimMission} from "../missions/ClaimMission";
import {DefenseMission} from "../missions/DefenseMission";
import {EmergencyMinerMission} from "../missions/EmergencyMission";
import {GeologyMission} from "../missions/GeologyMission";
import {IgorMission} from "../missions/IgorMission";
import {LinkMiningMission} from "../missions/LinkMiningMission";
import {LinkNetworkMission} from "../missions/LinkNetworkMission";
import {MasonMission} from "../missions/MasonMission";
import {MiningMission} from "../missions/MiningMission";
import {PowerMission} from "../missions/PowerMission";
import {RefillMission} from "../missions/RefillMission";
import {RemoteBuildMission} from "../missions/RemoteBuildMission";
import {ScoutMission} from "../missions/ScoutMission";
import {SurveyMission} from "../missions/SurveyMission";
import {TerminalNetworkMission} from "../missions/TerminalNetworkMission";
import {UpgradeMission} from "../missions/UpgradeMission";
import {SeedAnalysis} from "../SeedAnalysis";
import {DefenseGuru} from "./DefenseGuru";
import {Operation} from "./Operation";
import {RoomHelper} from "../RoomHelper";

export abstract class ControllerOperation extends Operation {

    public memory: {
        powerMining: boolean
        noMason: boolean
        masonPotency: number
        builderPotency: number
        wallBoost: boolean
        mason: { activateBoost: boolean }
        network: { scanData: { roomNames: string[] } }
        centerPosition: RoomPosition;
        centerPoint: Coord;
        rotation: number
        repairIndices: { [structureType: string]: number }
        temporaryPlacement: { [level: number]: boolean }
        checkLayoutIndex: number
        layoutMap: { [structureType: string]: Coord[] }
        radius: number
        seedData: SeedData
        lastChecked: { [structureType: string]: number }
        spawnRooms: string[]

        // deprecated values
        flexLayoutMap: { [structureType: string]: Coord[] }
        flexRadius: number
    };
    public staticStructures: { [structureType: string]: Coord[] };

    public constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.OwnedRoom;
        if (this.flag.room && this.flag.room.controller.level < 6) {
            this.priority = OperationPriority.VeryHigh;
        }
    }

    public initRemoteSpawn(roomDistanceLimit: number, levelRequirement: number, margin = 0) {
        // invalidated periodically
        if (!this.spawnData.nextSpawnCheck || Game.time >= this.spawnData.nextSpawnCheck) {
            console.log("roomDistanceLimit", roomDistanceLimit);
            console.log("empire spawnGroups", JSON.stringify(_.toArray(empire.spawnGroups), null, 2));
            const spawnGroups = _.filter(_.toArray(empire.spawnGroups),
                spawnGroup => spawnGroup.room.controller.level >= levelRequirement
                    && spawnGroup.room.name !== this.flag.pos.roomName);
            console.log("spawnGroups", JSON.stringify(spawnGroups, null, 2));
            let bestGroups = RoomHelper.findClosest(this.flag, spawnGroups,
                {margin, linearDistanceLimit: roomDistanceLimit});
            console.log("bestGroups", JSON.stringify(bestGroups, null, 2));

            if (bestGroups.length > 0) {
                bestGroups = _.sortBy(bestGroups, value => value.distance);
                this.spawnData.spawnRooms = _.map(bestGroups, value => {
                    return {distance: value.distance, roomName: value.destination.room.name};
                });
                this.spawnData.nextSpawnCheck = Game.time + helper.randomInterval(10000); // Around 10 hours
            }
            else {
                this.spawnData.nextSpawnCheck = Game.time + 100; // Around 6 min
            }
            console.log(`SPAWN: finding spawn rooms in ${this.name}, result: ${bestGroups.length} found`);
        }

        if (this.spawnData.spawnRooms) {
            let bestAvailability = 0;
            let bestSpawn: { distance: number, roomName: string };
            for (const data of this.spawnData.spawnRooms) {
                const spawnGroup = empire.getSpawnGroup(data.roomName);
                if (!spawnGroup) { continue; }
                if (spawnGroup.averageAvailability >= 1) {
                    bestSpawn = data;
                    break;
                }
                if (spawnGroup.averageAvailability > bestAvailability) {
                    bestAvailability = spawnGroup.averageAvailability;
                    bestSpawn = data;
                }
            }
            if (bestSpawn) {
                this.remoteSpawn = {distance: bestSpawn.distance, spawnGroup: empire.getSpawnGroup(bestSpawn.roomName)};
            }
        }
    }

    public initOperation() {
        this.autoLayout();

        this.spawnGroup = empire.getSpawnGroup(this.flag.pos.roomName);
        this.initRemoteSpawn(1000, 8);

        let remoteSpawning = false;
        if (!this.spawnGroup) {
            remoteSpawning = true;

            if (!this.remoteSpawn) {
                console.log(`${this.name} is unable to spawn, no local or remote spawnGroup`);
                return;
            }

            this.spawnGroup = this.remoteSpawn.spawnGroup;
            this.addMission(new ScoutMission(this));
            this.addMission(new ClaimMission(this));
            if (!this.hasVision || this.room.controller.level === 0) return; // vision can be assumed after this point
        }

        this.addMission(new RemoteBuildMission(this, false, remoteSpawning));
        if (this.room.controller.level < 3
            && this.room.findStructures(STRUCTURE_TOWER).length === 0
            && remoteSpawning) {
            this.addMission(new BodyguardMission(this));
        }

        if (this.flag.room.findStructures(STRUCTURE_SPAWN).length > 0) {
            // spawn emergency miner if needed
            this.addMission(new EmergencyMinerMission(this));
            // refill spawning energy - will spawn small spawnCart if needed
            this.addMission(new RefillMission(this));
        }

        const defenseGuru = new DefenseGuru(this);
        this.addMission(new DefenseMission(this));
        this.addMission(new PowerMission(this));

        // energy network
        if (this.flag.room.terminal && this.flag.room.storage && this.flag.room.controller.level >= 6) {
            this.addMission(new TerminalNetworkMission(this));
            this.addMission(new IgorMission(this));
        }

        // harvest energy
        for (let i = 0; i < this.sources.length; i++) {
            if (this.sources[i].pos.lookFor(LOOK_FLAGS).length > 0) continue;
            const source = this.sources[i];
            if (this.flag.room.controller.level === 8 && this.flag.room.storage) {
                const link = source.findMemoStructure(STRUCTURE_LINK, 2, true) as StructureLink;
                if (link) {
                    this.addMission(new LinkMiningMission(this, "miner" + i, source, link));
                    continue;
                }
                else {
                    this.placeLink(source);
                }
            }
            this.addMission(new MiningMission(this, "miner" + i, source));
        }

        // build construction
        const buildMission = new BuilderMission(this, defenseGuru);
        this.addMission(buildMission);

        if (this.flag.room.storage) {
            // use link array near storage to fire energy at controller link (pre-rcl8)
            this.addMission(new LinkNetworkMission(this));
            // mine minerals
            this.addMission(new GeologyMission(this));
            // scout and place harvest flags
            this.addMission(new SurveyMission(this));
            // repair walls
            this.addMission(new MasonMission(this, defenseGuru));
        }

        // upgrader controller
        const boostUpgraders = this.flag.room.controller.level < 8;
        const upgradeMission = new UpgradeMission(this, boostUpgraders);
        this.addMission(upgradeMission);

        // upkeep roads and walls
        this.towerRepair();
    }

    public finalizeOperation() {
    }

    public invalidateOperationCache() {
    }

    public nuke(x: number, y: number, roomName: string): string {
        const nuker = _.head(this.flag.room.find(FIND_MY_STRUCTURES,
            {filter: {structureType: STRUCTURE_NUKER}})) as StructureNuker;
        const outcome = nuker.launchNuke(new RoomPosition(x, y, roomName));
        if (outcome === OK) {
            empire.map.addNuke({tick: Game.time, roomName});
            return "NUKER: Bombs away! \\o/";
        }
        else {
            return `NUKER: error: ${outcome}`;
        }
    }

    public moveLayout(x: number, y: number, rotation: number): string {
        this.memory.centerPosition = new RoomPosition(x, y, this.flag.pos.roomName);
        this.memory.rotation = rotation;
        this.memory.layoutMap = undefined;
        this.showLayout(false);

        return `moving layout, run command ${this.name}.showLayout(true) to display`;
    }

    public showLayout(show: boolean, type = "all"): string {
        if (!this.memory.rotation === undefined || !this.memory.centerPosition) {
            return "No layout defined";
        }

        if (!show) {
            for (const flagName in Game.flags) {
                const flag = Game.flags[flagName];
                if (flag.name.indexOf(`${this.name}_layout`) >= 0) { flag.remove(); }
            }
            return "removing layout flags";
        }

        for (const structureType of Object.keys(CONSTRUCTION_COST)) {
            if (type === "all" || type === structureType) {
                const coords = this.layoutCoords(structureType);
                let order = 0;
                for (const coord of coords) {
                    const flagName = `${this.name}_layout_${structureType}_${order++}`;
                    const flag = Game.flags[flagName];
                    if (flag) {
                        flag.setPosition(coord.x, coord.y);
                        continue;
                    }

                    const position = helper.coordToPosition(coord, this.memory.centerPosition, this.memory.rotation);
                    let color = COLOR_WHITE;
                    if (structureType === STRUCTURE_EXTENSION || structureType === STRUCTURE_SPAWN
                        || structureType === STRUCTURE_STORAGE || structureType === STRUCTURE_NUKER) {
                        color = COLOR_YELLOW;
                    }
                    else if (structureType === STRUCTURE_TOWER) {
                        color = COLOR_BLUE;
                    }
                    else if (structureType === STRUCTURE_LAB || structureType === STRUCTURE_TERMINAL) {
                        color = COLOR_CYAN;
                    }
                    else if (structureType === STRUCTURE_POWER_SPAWN) {
                        color = COLOR_RED;
                    }
                    else if (structureType === STRUCTURE_OBSERVER) {
                        color = COLOR_BROWN;
                    }
                    else if (structureType === STRUCTURE_ROAD) {
                        color = COLOR_GREY;
                    }
                    else if (structureType === STRUCTURE_RAMPART) {
                        color = COLOR_GREEN;
                    }
                    position.createFlag(flagName, color);
                }
            }
        }

        return `showing layout flags for: ${type}`;
    }

    protected abstract initAutoLayout();

    protected abstract temporaryPlacement(controllerLevel: number);

    protected allowedCount(structureType: string, level: number): number {
        if (level < 5 && (structureType === STRUCTURE_RAMPART || structureType === STRUCTURE_WALL
            || structureType === STRUCTURE_ROAD)) {
            return 0;
        }

        return Math.min(CONTROLLER_STRUCTURES[structureType][level], this.layoutCoords(structureType).length);
    }

    protected layoutCoords(structureType: string): Coord[] {
        if (this.staticStructures[structureType]) {
            return this.staticStructures[structureType];
        }
        else if (this.memory.layoutMap && this.memory.layoutMap[structureType]) {
            return this.memory.layoutMap[structureType];
        }
        else {
            return [];
        }
    }

    protected towerRepair() {

        if (this.flag.room.hostiles.length > 0) return;

        let structureType = STRUCTURE_RAMPART;
        if (Game.time % 2 === 0) {
            structureType = STRUCTURE_ROAD;
        }

        const coords = this.layoutCoords(structureType);
        if (!this.memory.repairIndices) { this.memory.repairIndices = {}; }
        if (this.memory.repairIndices[structureType] === undefined ||
            this.memory.repairIndices[structureType] >= coords.length) {
            this.memory.repairIndices[structureType] = 0;
        }

        const coord = coords[this.memory.repairIndices[structureType]++];
        // FIXME this check is for a room with a failed layout
        if (this.memory.centerPosition) {
            const position = helper.coordToPosition(coord, this.memory.centerPosition, this.memory.rotation);
            const structure = position.lookForStructure(structureType);
            if (structure) {
                this.repairLayout(structure);
            }
        }
    }

    private autoLayout() {
        this.initWithSpawn();
        if (!this.memory.centerPosition || this.memory.rotation === undefined) return;
        this.initAutoLayout();
        this.buildLayout();
    }

    private buildLayout() {
        if (!this.flag.room) return;
        const structureTypes = Object.keys(CONSTRUCTION_COST);
        if (this.memory.checkLayoutIndex === undefined || this.memory.checkLayoutIndex >= structureTypes.length) {
            this.memory.checkLayoutIndex = 0;
        }
        const structureType = structureTypes[this.memory.checkLayoutIndex++];

        this.fixedPlacement(structureType);
        this.temporaryPlacement(this.flag.room.controller.level);
    }

    private fixedPlacement(structureType: string) {
        const controllerLevel = this.flag.room.controller.level;
        let constructionPriority = Math.max(controllerLevel * 10, 40);
        if (controllerLevel === 1) {
            constructionPriority = 90;
        }
        if (Object.keys(Game.constructionSites).length > constructionPriority) return;
        if (structureType === STRUCTURE_RAMPART && controllerLevel < 5) return;
        if (!this.memory.lastChecked) this.memory.lastChecked = {};
        if (Game.time - this.memory.lastChecked[structureType] < 1000) return;

        const coords = this.layoutCoords(structureType);
        const allowedCount = this.allowedCount(structureType, controllerLevel);

        for (let i = 0; i < coords.length; i++) {
            if (i >= allowedCount) break;

            const coord = coords[i];
            const position = helper.coordToPosition(coord, this.memory.centerPosition, this.memory.rotation);
            const structure = position.lookForStructure(structureType);
            if (structure) {
                this.repairLayout(structure);
                continue;
            }
            const hasConstruction = position.lookFor(LOOK_CONSTRUCTION_SITES)[0];
            if (hasConstruction) continue;

            const outcome = position.createConstructionSite(structureType);
            if (outcome === OK) {
                console.log(`LAYOUT: placing ${structureType} at ${position} (${this.name})`);
            }
            else {
                // console.log(`LAYOUT: bad construction placement: ${outcome}, ${structureType}, ${position}
                // (${this.name})`);
            }

            return;
        }

        this.memory.lastChecked[structureType] = Game.time;
    }

    private recalculateLayout(layoutType?: string) {
        if (!this.memory.seedData) {
            const sourceData = [];
            for (const source of this.flag.room.find<Source>(FIND_SOURCES)) {
                sourceData.push({pos: source.pos, amount: 3000});
            }
            this.memory.seedData = {
                sourceData,
                seedScan: {},
                seedSelectData: undefined,
            };
        }

        const analysis = new SeedAnalysis(this.flag.room, this.memory.seedData);
        const results = analysis.run(this.staticStructures, layoutType);
        if (results) {
            const centerPosition = new RoomPosition(results.origin.x, results.origin.y, this.flag.room.name);
            if (results.seedType === this.type) {
                console.log(`${this.name} found best seed of type ${results.seedType}, initiating auto-layout`);
                this.memory.centerPosition = centerPosition;
                this.memory.rotation = results.rotation;
            }
            else {
                console.log(`${this.name} found best seed of another type, replacing operation`);
                const flagName = `${results.seedType}_${this.name}`;
                Memory.flags[flagName] = {centerPosition, rotation: results.rotation};
                this.flag.pos.createFlag(flagName, COLOR_GREY);
                this.flag.remove();
            }
            this.memory.seedData = undefined; // clean-up memory
        }
        else {
            console.log(`${this.name} could not find a suitable auto-layout, consider using another spawn location or room`);
        }
    }

    private initWithSpawn() {
        if (!this.flag.room) return;
        if (!this.memory.centerPosition || this.memory.rotation === undefined) {
            const structureCount = this.flag.room.find(FIND_STRUCTURES).length;
            if (structureCount === 1) {
                this.recalculateLayout();
            }
            else if (structureCount > 1) {
                this.recalculateLayout(this.type);
            }
            return;
        }
    }

    // deprecated
    // private findRemoteSpawn(distanceLimit: number, levelRequirement = 8): SpawnGroup {
    //     return _(empire.spawnGroups)
    //         .filter((s: SpawnGroup) => {
    //             return Game.map.getRoomLinearDistance(this.flag.pos.roomName, s.room.name) <= distanceLimit
    //                 && s.room.controller.level >= levelRequirement
    //                 && s.averageAvailability > .3
    //                 && s.isAvailable;
    //         })
    //         .sortBy((s: SpawnGroup) => {
    //             return Game.map.getRoomLinearDistance(this.flag.pos.roomName, s.room.name);
    //         })
    //         .head();
    // }

    private repairLayout(structure: Structure) {
        let repairsNeeded = Math.floor((structure.hitsMax - structure.hits) / 800);
        if (structure.structureType === STRUCTURE_RAMPART) {
            if (structure.hits >= 100000) return;
        }
        else {
            if (repairsNeeded === 0) return;
        }

        const towers = this.flag.room.findStructures<StructureTower>(STRUCTURE_TOWER);

        for (const tower of towers) {
            if (repairsNeeded === 0) { return; }
            if (tower.alreadyFired) { continue; }
            if (!tower.pos.inRangeTo(structure, Math.max(5, this.memory.radius - 3))) { continue; }
            // const outcome = tower.repair(structure);
            tower.repair(structure);
            repairsNeeded--;
        }

        if (repairsNeeded > 0 && towers.length > 0) {
            structure.pos.findClosestByRange<StructureTower>(towers).repair(structure);
        }
    }

    private placeLink(source: Source) {
        if (source.pos.findInRange(FIND_CONSTRUCTION_SITES, 2).length > 0) return;
        if (source.pos.findInRange(source.room.findStructures<StructureLink>(STRUCTURE_LINK), 2).length > 0) return;

        let positions: RoomPosition[] = [];
        const ret = empire.traveler.findTravelPath(this.room.storage, source);
        if (ret.incomplete) { console.log(`LINKMINER: Path to source incomplete ${this.flag.pos.roomName}`); }
        const minerPos = _.last(ret.path);
        for (const position of minerPos.openAdjacentSpots(true)) {
            if (!position.isPassable(true)) { continue; }
            if (position.findInRange([this.room.controller], 3).length > 0) { continue; }
            if (position.findInRange(FIND_SOURCES, 2).length > 1) { continue; }
            if (position.findInRange(ret.path, 0).length > 0) {continue; }
            positions.push(position);
        }
        if (positions.length === 0) {
            console.log(`LINKMINER: no suitable position for link ${this.flag.pos.roomName}`);
        }

        positions = _.sortBy(positions, (p: RoomPosition) => p.getRangeTo(this.flag.room.storage));
        positions[0].createConstructionSite(STRUCTURE_LINK);
        notifier.log(`placed link ${this.flag.room.name}`);

    }
}
