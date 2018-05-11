import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {Mission} from "./Mission";

export class EmergencyMinerMission extends Mission {
    public emergencyMiners: Agent[];
    public memory: {
        lastTick: number,
    };

    /**
     * Checks every 100 ticks if storage is full or a miner is present, if not spawns an emergency miner. Should come
     * first in FortOperation
     * @param operation
     */
    constructor(operation: Operation) {
        super(operation, "emergencyMiner");
    }

    public initMission() {
    }

    public roleCall() {
        const energyAvailable = this.spawnGroup.currentSpawnEnergy >= 1300 ||
            (this.room.storage && this.room.storage.store.energy > 1300) || this.findMinersBySources();
        if (energyAvailable) {
            this.memory.lastTick = Game.time;
        }

        const getMaxMiners = () => {
            if (!this.memory.lastTick || Game.time > this.memory.lastTick + 100) {
                if (Game.time % 10 === 0) {
                    console.log("ATTN: Backup miner being spawned in", this.operation.name);
                }
                return 2;
            }
        };

        this.emergencyMiners = this.headCount("emergencyMiner", () => this.workerBody(2, 1, 1), getMaxMiners);
    }

    public missionActions() {
        for (const miner of this.emergencyMiners) {
            this.minerActions(miner);
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

    private minerActions(miner: Agent) {
        const closest = miner.pos.findClosestByRange(FIND_SOURCES) as Source;
        if (!miner.pos.isNearTo(closest)) {
            miner.travelTo(closest);
            return;
        }

        miner.memory.donatesEnergy = true;
        miner.memory.scavanger = RESOURCE_ENERGY;
        miner.harvest(closest);
    }

    private findMinersBySources() {
        for (const source of this.room.find<Source>(FIND_SOURCES)) {
            if (source.pos.findInRange(FIND_MY_CREEPS, 1, {filter: (c: Creep) => c.partCount(WORK) > 0}).length > 0) {
                return true;
            }
        }
        return false;
    }
}
