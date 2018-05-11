import {RaidData} from "../../interfaces";
import {Operation} from "../operations/Operation";
import {SpawnGroup} from "../SpawnGroup";
import {RaidMission} from "./RaidMission";

export class BrawlerMission extends RaidMission {
    constructor(operation: Operation, name: string, raidData: RaidData, spawnGroup: SpawnGroup, boostLevel: number, allowSpawn: boolean) {
        super(operation, name, raidData, spawnGroup, boostLevel, allowSpawn);
        this.specialistPart = ATTACK;
        this.specialistBoost = RESOURCE_CATALYZED_UTRIUM_ACID;
        this.spawnCost = 10550;
        this.attackRange = 1;
        this.attacksCreeps = true;
        this.attackerBoosts = [
            RESOURCE_CATALYZED_UTRIUM_ACID,
            RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
            RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
            RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
        ];
        this.killCreeps = operation.memory.killCreeps;
    }

    public clearActions(attackingCreep: boolean) {
        this.standardClearActions(attackingCreep);
    }
}
