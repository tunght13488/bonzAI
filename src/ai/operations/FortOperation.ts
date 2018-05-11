import {OperationPriority} from "../../config/constants";
import {empire} from "../../helpers/loopHelper";
import {BuilderMission} from "../missions/BuilderMission";
import {DefenseMission} from "../missions/DefenseMission";
import {EmergencyMinerMission} from "../missions/EmergencyMission";
import {GeologyMission} from "../missions/GeologyMission";
import {IgorMission} from "../missions/IgorMission";
import {LinkMiningMission} from "../missions/LinkMiningMission";
import {LinkNetworkMission} from "../missions/LinkNetworkMission";
import {MiningMission} from "../missions/MiningMission";
import {PaverMission} from "../missions/PaverMission";
import {PowerMission} from "../missions/PowerMission";
import {RefillMission} from "../missions/RefillMission";
import {TerminalNetworkMission} from "../missions/TerminalNetworkMission";
import {UpgradeMission} from "../missions/UpgradeMission";
import {ENERGYSINK_THRESHOLD, NEED_ENERGY_THRESHOLD} from "../TradeNetwork";
import {DefenseGuru} from "./DefenseGuru";
import {Operation} from "./Operation";

export class FortOperation extends Operation {

    /**
     * Manages the activities of an owned missionRoom, assumes bonzaiferroni's build spec
     * @param flag
     * @param name
     * @param type
     */
    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.OwnedRoom;
    }

    public initOperation() {
        if (this.flag.room) {
            // initOperation FortOperation variables
            this.spawnGroup = empire.getSpawnGroup(this.flag.room.name);

            // spawn emergency miner if needed
            this.addMission(new EmergencyMinerMission(this));

            // refill spawning energy - will spawn small spawnCart if needed
            const structures = this.flag.room.findStructures(STRUCTURE_EXTENSION)
                .concat(this.flag.room.find(FIND_MY_SPAWNS)) as Structure[];
            const maxCarts = this.flag.room.storage ? 1 : 2;
            this.addMission(new RefillMission(this));

            this.addMission(new DefenseMission(this));

            if (this.memory.powerMining) {
                this.addMission(new PowerMission(this));
            }

            // energy network
            if (this.flag.room.terminal && this.flag.room.storage) {
                this.addMission(new TerminalNetworkMission(this));
                this.addMission(new IgorMission(this));
            }

            // harvest energy
            for (let i = 0; i < this.sources.length; i++) {
                if (this.sources[i].pos.lookFor(LOOK_FLAGS).length > 0) continue;
                const source = this.sources[i];
                if (this.flag.room.controller.level === 8 && this.flag.room.storage) {
                    const link = source.findMemoStructure(STRUCTURE_LINK, 2) as StructureLink;
                    if (link) {
                        this.addMission(new LinkMiningMission(this, "linkMiner" + i, source, link));
                        continue;
                    }
                }
                this.addMission(new MiningMission(this, "miner" + i, source));
            }

            // build construction
            const defenseGuru = new DefenseGuru(this);
            this.addMission(new BuilderMission(this, defenseGuru));

            // build walls
            // TODO: make MasonMission

            // use link array near storage to fire energy at controller link (pre-rcl8)
            if (this.flag.room.storage) {
                this.addMission(new LinkNetworkMission(this));

                const extractor = this.mineral.pos.lookFor<StructureExtractor>(LOOK_STRUCTURES)[0];
                if (this.flag.room.energyCapacityAvailable > 5000 && extractor && extractor.my) {
                    this.addMission(new GeologyMission(this));
                }
            }

            // upgrader controller
            const boostUpgraders = this.flag.room.controller.level < 8;
            this.addMission(new UpgradeMission(this, boostUpgraders));

            // pave all roads in the missionRoom
            this.addMission(new PaverMission(this));
        }
    }

    public finalizeOperation() {
    }

    public invalidateOperationCache() {
        this.memory.masonPotency = undefined;
        this.memory.builderPotency = undefined;
    }

    public calcMasonPotency(): number {
        if (!this.memory.masonPotency) {
            const surplusMode = this.flag.room.storage && this.flag.room.storage.store.energy > NEED_ENERGY_THRESHOLD;
            const megaSurplusMode = this.flag.room.storage &&
                this.flag.room.storage.store.energy >
                ENERGYSINK_THRESHOLD;
            let potencyBasedOnStorage = megaSurplusMode ? 10 : surplusMode ? 5 : 1;

            if (this.memory.wallBoost) {
                potencyBasedOnStorage = 20;
            }

            // would happen to be the same as the potency used for builders
            const potencyBasedOnSpawn = this.calcBuilderPotency();

            if (this.memory.wallBoost) {
                this.memory.mason.activateBoost = true;
            }

            this.memory.masonPotency = Math.min(potencyBasedOnSpawn, potencyBasedOnStorage);
        }
        return this.memory.masonPotency;
    }

    public calcBuilderPotency(): number {
        if (!this.memory.builderPotency) {
            this.memory.builderPotency = Math.min(Math.floor(this.spawnGroup.maxSpawnEnergy / 175), 20);
        }
        return this.memory.builderPotency;
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
}
