import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {Mission} from "./Mission";

export class LinkMiningMission extends Mission {

    public linkMiners: Agent[];
    public source: Source;
    public link: StructureLink;

    /**
     * Sends a miner to a source with a link, energy transfer is managed by LinkNetworkMission
     * @param operation
     * @param name
     * @param source
     * @param link
     */

    constructor(operation: Operation, name: string, source: Source, link: StructureLink) {
        super(operation, name);
        this.source = source;
        this.link = link;
    }

    public initMission() {
    }

    public roleCall() {
        this.linkMiners = this.headCount(this.name, () => this.workerBody(5, 4, 5), () => 1);
    }

    public missionActions() {
        for (const miner of this.linkMiners) {
            this.minerActions(miner);
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

    private minerActions(miner: Agent) {
        if (!miner.memory.inPosition) {
            this.moveToPosition(miner);
            return; // early
        }

        miner.memory.donatesEnergy = true;
        miner.memory.scavanger = RESOURCE_ENERGY;
        miner.harvest(this.source);
        if (miner.carry.energy === miner.carryCapacity) {
            miner.transfer(this.link, RESOURCE_ENERGY);
        }
    }

    /**
     * Picks a position between the source and the link and moves there, robbing and killing any miner at that position
     * @param miner
     */
    private moveToPosition(miner: Agent) {
        let roadPos: RoomPosition;

        for (let i = 1; i <= 8; i++) {
            const position = this.source.pos.getPositionAtDirection(i);
            if (!position.isPassable(true)) continue;
            if (!position.isNearTo(this.link)) continue;
            if (position.lookForStructure(STRUCTURE_ROAD)) {
                roadPos = position;
            }

            if (miner.pos.inRangeTo(position, 0)) {
                miner.memory.inPosition = true;
            }
            else {
                miner.moveItOrLoseIt(position, "miner");
            }
            return; // early
        }
        if (!miner.memory.posNotify) {
            miner.memory.posNotify = true;
            console.log("couldn't find valid position for", miner.name, "in ", miner.room.name);
        }

        if (miner.pos.inRangeTo(roadPos, 0)) {
            miner.memory.inPosition = true;
        }
        else {
            miner.moveItOrLoseIt(roadPos, "miner");
        }
    }
}
