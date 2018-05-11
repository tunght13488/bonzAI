import {empire} from "../../helpers/loopHelper";
import {DemolishMission} from "../missions/DemolishMission";
import {Operation} from "./Operation";

export class DemolishOperation extends Operation {

    /**
     * Spawn a demolisher when there are flags that match his pattern ("Flag + n"), he will visit those flags and
     * remove the structures underneath. This pattern happens to be the default flag pattern used by the game UI, be
     * careful. To have it spawn a scavanger to harvest energy, place a flag with name "opName_store" over a
     * container/storage/terminal
     * @param flag
     * @param name
     * @param type
     */
    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
    }

    public initOperation() {
        this.spawnGroup = empire.getSpawnGroup(this.flag.room.name);

        this.addMission(new DemolishMission(this));
    }

    public finalizeOperation() {
    }

    public invalidateOperationCache() {
    }
}
