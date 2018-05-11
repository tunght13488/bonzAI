import {empire} from "../../helpers/loopHelper";
import {TransportMission} from "../missions/TransportMission";
import {Operation} from "./Operation";

export class TransportOperation extends Operation {
    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
    }

    public initOperation() {
        this.spawnGroup = empire.getSpawnGroup(this.flag.room.name);
        this.findOperationWaypoints();

        const max = this.memory.max !== undefined ? this.memory.max : 1;
        this.addMission(new TransportMission(this,
            max,
            undefined,
            undefined,
            this.memory.resourceType,
            this.memory.offRoad));
    }

    public finalizeOperation() {
    }

    public invalidateOperationCache() {
    }
}
