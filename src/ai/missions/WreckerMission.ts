import {RaidData} from "../../interfaces";
import {Operation} from "../operations/Operation";
import {SpawnGroup} from "../SpawnGroup";
import {RaidMission} from "./RaidMission";

export class WreckerMission extends RaidMission {

    constructor(operation: Operation, name: string, raidData: RaidData, spawnGroup: SpawnGroup, boostLevel: number, allowSpawn: boolean) {
        super(operation, name, raidData, spawnGroup, boostLevel, allowSpawn);
        this.specialistPart = WORK;
        this.specialistBoost = RESOURCE_CATALYZED_ZYNTHIUM_ACID;
        this.spawnCost = 11090;
        this.attackRange = 1;
        this.attacksCreeps = false;
        this.attackerBoosts = [
            RESOURCE_CATALYZED_ZYNTHIUM_ACID,
            RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
            RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
            RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
        ];
    }

    public clearActions(attackingCreep: boolean) {
        this.standardClearActions(attackingCreep);
    }
}
