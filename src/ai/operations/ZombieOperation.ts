import {OperationPriority} from "../../config/constants";
import {RaidGuru} from "../missions/RaidGuru";
import {ZombieMission} from "../missions/ZombieMission";
import {Operation} from "./Operation";

export class ZombieOperation extends Operation {
    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.Low;
    }

    public initOperation() {
        this.initRemoteSpawn(4, 8);
        if (this.remoteSpawn) {
            this.spawnGroup = this.remoteSpawn.spawnGroup;
        }
        else {
            return;
        }

        if (!this.spawnGroup) return;
        const raidGuru = new RaidGuru(this);
        raidGuru.init(this.flag.pos.roomName, true);
        this.addMission(new ZombieMission(this, raidGuru));
    }

    public finalizeOperation() {
    }

    public invalidateOperationCache() {
    }
}
